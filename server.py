# TrendPulse - Standard Library Backend with SQLite3 (server.py)

import os
import sys
import json
import sqlite3
import urllib.request
import urllib.error
import urllib.parse
import xml.etree.ElementTree as ET
from http.server import BaseHTTPRequestHandler, HTTPServer
import socketserver
import datetime
import re
import threading
import time
import html

# 1. 경로 설정 (배포 시 실행 폴더 위치에 구애받지 않도록 스크립트 디렉토리 기준 절대경로 계산)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'trends.db')

# 1.5 .env 파일 로드 (네이버 Open API 연동용 설정값 확인)
ENV = {}
env_path = os.path.join(BASE_DIR, '.env')
if os.path.exists(env_path):
    try:
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and '=' in line and not line.startswith('#'):
                    k, v = line.split('=', 1)
                    ENV[k.strip()] = v.strip().strip('"').strip("'")
        print("[ENV] .env 설정 파일 로드 성공.")
    except Exception as e:
        print(f"[ENV WARNING] .env 파일 분석 실패: {e}")

# 2. 데이터베이스 초기화 및 기본 테이블 스키마 설정
def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 트렌드 시계열 테이블
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS trends (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            keyword TEXT NOT NULL,
            category TEXT NOT NULL,
            score REAL NOT NULL,
            traffic INTEGER NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # 실시간 뉴스 테이블
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS news (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            source TEXT NOT NULL,
            link TEXT NOT NULL,
            pub_date TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # 연관어 매핑 테이블
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS related_words (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            keyword_name TEXT NOT NULL,
            word TEXT NOT NULL,
            UNIQUE(keyword_name, word) ON CONFLICT IGNORE
        )
    ''')
    
    conn.commit()

    # 최초 실행 시, 시계열 그래프(history)가 빈칸으로 나타나지 않도록 
    # 과거 1년치 분량의 더미 히스토리 데이터를 SQLite에 백필링(Backfilling) 적재
    cursor.execute("SELECT COUNT(*) FROM trends")
    if cursor.fetchone()[0] == 0:
        print("[DB] 과거 시계열 데이터 백필링(Backfilling)을 시작합니다...")
        initial_topics = [
            ("K-푸드 수출액 최고치", "search", 150000, ["냉동김밥", "라면 수출", "김치 대란", "글로벌 한식", "H마트"]),
            ("온디바이스 AI 번역 출시", "search", 100000, ["실시간 번역", "스마트폰 통역", "온디바이스 AI", "음성인식", "외국어"]),
            ("요거트 제로 디저트 유행", "social", 85000, ["제로 슈가", "요거트 아이스크림", "초저칼로리", "혈당 관리", "카페 신상"]),
            ("성수동 로컬 팝업 웨이팅", "social", 95000, ["성수동 팝업", "오픈런", "웨이팅 팁", "인스타 핫플", "한정 굿즈"]),
            ("올인원 로봇청소기 특가", "shopping", 120000, ["이모님 청소기", "가사 해방", "자동 비움", "스마트 홈", "신혼 필수품"]),
            ("홈 바 위스키 믹솔로지", "shopping", 70000, ["하이볼", "위스키 추천", "싱글 몰트", "홈술", "칵테일 레시피"]),
            ("두뇌 서바이벌 예능 1위", "content", 130000, ["서바이벌", "넷플릭스 신작", "플레이어", "추리 예능", "정주행"]),
            ("버추얼 아이돌 지상파 1위", "content", 90000, ["버추얼 아바타", "스트리머", "음원 차트인", "메타버스 콘서트", "팬덤"]),
            ("초단기 알바 플랫폼 확산", "search", 60000, ["N잡러", "알바몬", "배달 알바", "긱 이코노미", "알바 앱"]),
            ("Y2K 레트로 패션 대유행", "social", 75000, ["카고팬츠", "실버 스트랩", "레트로 룩", "빈티지 샵", "세기말"]),
            ("가정용 미니 스마트 팜", "shopping", 55000, ["식물 재배기", "가정 원예", "유기농 채소", "수경 재배", "식물 집사"]),
            ("인디 게임 스팀 열풍", "content", 80000, ["스팀 게임", "1인 개발", "힐링 게임", "도트 그래픽", "국산 인디"])
        ]
        
        now = datetime.datetime.now(datetime.timezone.utc)
        
        # 오늘 기준 실시간 데이터만 수집하므로 과거 1년치 월별/일별 적재는 제외하고 오늘 24시간 분량만 초기 세팅

        # 3. 24시간 동안의 시간별 데이터 적재 (24포인트)
        print("[DB Seeding] 오늘 기준 데이터를 구축 중...")
        for h in range(24):
            t_time = now - datetime.timedelta(hours=24 - h)
            t_str = t_time.strftime('%Y-%m-%d %H:00:00')
            for topic, cat, traffic, related in initial_topics:
                score = 550 + (traffic / 280) + (h * 1.5) + (hash(topic + str(h)) % 20 - 10)
                cursor.execute(
                    "INSERT INTO trends (keyword, category, score, traffic, timestamp) VALUES (?, ?, ?, ?, ?)",
                    (topic, cat, score, traffic, t_str)
                )
                
                # 연관어 입력 (중복 제거)
                for r_word in related:
                    cursor.execute(
                        "INSERT OR IGNORE INTO related_words (keyword_name, word) VALUES (?, ?)",
                        (topic, r_word)
                    )
        conn.commit()
        print("[DB] 시계열 데이터 백필링 완수.")
    conn.close()

# 2.5. 네이버 Open API 호출 공통 헬퍼 함수
def call_naver_api(endpoint, method="GET", params=None, body=None):
    client_id = os.environ.get("NAVER_CLIENT_ID") or ENV.get("NAVER_CLIENT_ID")
    client_secret = os.environ.get("NAVER_CLIENT_SECRET") or ENV.get("NAVER_CLIENT_SECRET")
    if not client_id or not client_secret:
        return None
    
    url = endpoint
    if params:
        url += "?" + urllib.parse.urlencode(params)
        
    req = urllib.request.Request(url)
    req.add_header("X-Naver-Client-Id", client_id)
    req.add_header("X-Naver-Client-Secret", client_secret)
    req.add_header("Content-Type", "application/json")
    
    try:
        data_bytes = json.dumps(body).encode("utf-8") if body else None
        with urllib.request.urlopen(req, data=data_bytes, timeout=5) as res:
            return json.loads(res.read().decode("utf-8"))
    except Exception as e:
        print(f"[Naver API Error] {e}")
        return None

# 3. 백그라운드 수집 스케줄러 (구글 트렌드 및 뉴스 RSS Crawling Daemon)
def scrape_rss_feeds():
    print("[배치 스케줄러] 백그라운드 실시간 동기화 데몬 기동 완료.")
    ns = {
        'ht': 'http://www.google.com/trends/trendingsearches/daily'
    }
    
    while True:
        try:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # 카테고리 순환 배치용 리스트
            categories = ['search', 'social', 'shopping', 'content']
            keywords_list = []
            
            # 1단계: 실시간 검색 키워드 수집 (Nate 실시간 이슈 JSON API 최우선 활용)
            try:
                # 네이트 실시간 키워드 JSON API를 직접 가져옵니다.
                req_nate = urllib.request.Request(
                    'https://www.nate.com/js/data/jsonLiveKeywordDataV1.js',
                    headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
                )
                with urllib.request.urlopen(req_nate, timeout=8) as response:
                    js_data = response.read().decode('euc-kr')
                
                # JSON 데이터 파싱
                items = json.loads(js_data)
                categories = ['search', 'social', 'shopping', 'content']
                
                print(f"[배치 스케줄러] 네이트 JSON API 로드 성공. {len(items)}개 이슈 발견.")
                
                for idx, item in enumerate(items[:12]):  # 상위 12개 실시간 검색 이슈 추출
                    keyword = item[1]
                    query_kw = item[4] if len(item) > 4 and item[4] else keyword
                    category = categories[idx % len(categories)]
                    
                    # 순위별 가상 트래픽 할당 (1위 150000, 점진 감소)
                    traffic_num = 150000 - idx * 8000
                    
                    # 연관 단어 추출 (문장에서 공백 단위 분할하여 활용)
                    related_words = keyword.split(' ') + query_kw.split(' ')
                    related_words = [w for w in set(related_words) if len(w) >= 2]
                    if len(related_words) < 4:
                        related_words.extend(['실시간 이슈', '인기 키워드', '포털 검색', '화제'])
                    
                    # DB에 연관어 매핑 저장
                    for r_word in related_words[:5]:
                        cursor.execute(
                            "INSERT OR IGNORE INTO related_words (keyword_name, word) VALUES (?, ?)",
                            (keyword, r_word)
                        )
                    
                    keywords_list.append({
                        "keyword": keyword,
                        "query_keyword": query_kw,
                        "category": category,
                        "traffic": traffic_num,
                        "idx": idx
                    })
            except Exception as e_nate:
                print(f"[배치 스케줄러 WARNING] 네이트 API 수집 실패 ({e_nate}). 구글 RSS 시도를 시작합니다...")
                try:
                    # --- 구글 트렌드 KR 일별 RSS 수집 ---
                    req_trends = urllib.request.Request(
                        'https://trends.google.co.kr/trends/trendingsearches/daily/rss?geo=KR',
                        headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
                    )
                    with urllib.request.urlopen(req_trends, timeout=10) as response:
                        xml_data = response.read()
                        
                    root = ET.fromstring(xml_data)
                    xml_items = root.findall('.//item')
                    
                    for idx, item in enumerate(xml_items[:12]):
                        keyword = item.find('title').text
                        category = categories[idx % len(categories)]
                        
                        traffic_elem = item.find('ht:approx_traffic', ns)
                        traffic_str = traffic_elem.text if traffic_elem is not None else "5000+"
                        traffic_num = int(re.sub(r'[^0-9]', '', traffic_str))
                        
                        news_items = item.findall('ht:news_item', ns)
                        related_words = []
                        for news in news_items:
                            news_title = news.find('ht:news_item_title', ns).text
                            if news_title:
                                news_title = html.unescape(news_title)
                                words = re.findall(r'[가-힣a-zA-Z0-9]{2,6}', news_title)
                                related_words.extend(words)
                        
                        related_words = [w for w in set(related_words) if len(w) >= 2 and w not in ['속보', '종합', '단독', '기자', '뉴스', '오늘', '내일']]
                        if len(related_words) < 4:
                            related_words.extend(['트렌드', '이슈 분석', '실시간 반응', '소식'])
                        
                        for r_word in related_words[:5]:
                            cursor.execute(
                                "INSERT OR IGNORE INTO related_words (keyword_name, word) VALUES (?, ?)",
                                (keyword, r_word)
                            )
                        
                        keywords_list.append({
                            "keyword": keyword,
                            "category": category,
                            "traffic": traffic_num,
                            "idx": idx
                        })
                except Exception as e_rss:
                    print(f"[배치 스케줄러 WARNING] 구글 트렌드 RSS 수집 실패 ({e_rss}). 기본 12개 핵심 키워드로 대체합니다.")
                    initial_topics = [
                        ("K-푸드 수출액 최고치", "search", 150000, ["냉동김밥", "라면 수출", "김치 대란", "글로벌 한식", "H마트"]),
                        ("온디바이스 AI 번역 출시", "search", 100000, ["실시간 번역", "스마트폰 통역", "온디바이스 AI", "음성인식", "외국어"]),
                        ("요거트 제로 디저트 유행", "social", 85000, ["제로 슈가", "요거트 아이스크림", "초저칼로리", "혈당 관리", "카페 신상"]),
                        ("성수동 로컬 팝업 웨이팅", "social", 95000, ["성수동 팝업", "오픈런", "웨이팅 팁", "인스타 핫플", "한정 굿즈"]),
                        ("올인원 로봇청소기 특가", "shopping", 120000, ["이모님 청소기", "가사 해방", "자동 비움", "스마트 홈", "신혼 필수품"]),
                        ("홈 바 위스키 믹솔로지", "shopping", 70000, ["하이볼", "위스키 추천", "싱글 몰트", "홈술", "칵테일 레시피"]),
                        ("두뇌 서바이벌 예능 1위", "content", 130000, ["서바이벌", "넷플릭스 신작", "플레이어", "추리 예능", "정주행"]),
                        ("버추얼 아이돌 지상파 1위", "content", 90000, ["버추얼 아바타", "스트리머", "음원 차트인", "메타버스 콘서트", "팬덤"]),
                        ("초단기 알바 플랫폼 확산", "search", 60000, ["N잡러", "알바몬", "배달 알바", "긱 이코노미", "알바 앱"]),
                        ("Y2K 레트로 패션 대유행", "social", 75000, ["카고팬츠", "실버 스트랩", "레트로 룩", "빈티지 샵", "세기말"]),
                        ("가정용 미니 스마트 팜", "shopping", 55000, ["식물 재배기", "가정 원예", "유기농 채소", "수경 재배", "식물 집사"]),
                        ("인디 게임 스팀 열풍", "content", 80000, ["스팀 게임", "1인 개발", "힐링 게임", "도트 그래픽", "국산 인디"])
                    ]
                    for idx, (topic, cat, traffic, related) in enumerate(initial_topics):
                        keywords_list.append({
                            "keyword": topic,
                            "category": cat,
                            "traffic": traffic,
                            "idx": idx
                        })
                        for r_word in related:
                            cursor.execute(
                                "INSERT OR IGNORE INTO related_words (keyword_name, word) VALUES (?, ?)",
                                (topic, r_word)
                            )

            # 2단계: 네이버 API 기반 검색 스코어 백필링 (혹은 로컬 시뮬레이션 폴백)
            # 수집된 최신 키워드 이외의 오래된 또는 Seed dummy 키워드 기록은 제거하여 데이터 정합성 보장
            if keywords_list:
                active_keywords = [k["keyword"] for k in keywords_list]
                placeholders = ','.join('?' for _ in active_keywords)
                cursor.execute(f"DELETE FROM trends WHERE keyword NOT IN ({placeholders})", active_keywords)
                cursor.execute(f"DELETE FROM related_words WHERE keyword_name NOT IN ({placeholders})", active_keywords)

            client_id = os.environ.get("NAVER_CLIENT_ID") or ENV.get("NAVER_CLIENT_ID")
            client_secret = os.environ.get("NAVER_CLIENT_SECRET") or ENV.get("NAVER_CLIENT_SECRET")
            
            if client_id and client_secret:
                print(f"[배치 스케줄러] 네이버 DataLab API를 통해 {len(keywords_list)}개 키워드의 검색 추이를 동기화합니다...")
                
                # 네이버 API는 한번에 최대 5개 키워드 그룹 조회가 가능하므로 5개 크기로 분할하여 요청 진행
                batches = [keywords_list[i:i+5] for i in range(0, len(keywords_list), 5)]
                
                now_utc = datetime.datetime.now(datetime.timezone.utc)
                today_str = now_utc.strftime('%Y-%m-%d')
                thirty_days_ago_str = (now_utc - datetime.timedelta(days=30)).strftime('%Y-%m-%d')
                
                for batch in batches:
                    if not batch:
                        continue
                    
                    TOPIC_QUERY_MAP = {
                        "K-푸드 수출액 최고치": "K-푸드",
                        "온디바이스 AI 번역 출시": "온디바이스 AI",
                        "요거트 제로 디저트 유행": "요거트",
                        "성수동 로컬 팝업 웨이팅": "성수동 팝업",
                        "올인원 로봇청소기 특가": "로봇청소기",
                        "홈 바 위스키 믹솔로지": "하이볼",
                        "두뇌 서바이벌 예능 1위": "서바이벌 예능",
                        "버추얼 아이돌 지상파 1위": "버추얼 아이돌",
                        "초단기 알바 플랫폼 확산": "알바",
                        "Y2K 레트로 패션 대유행": "Y2K",
                        "가정용 미니 스마트 팜": "스마트 팜",
                        "인디 게임 스팀 열풍": "인디 게임"
                    }
                    keyword_groups = []
                    for k_info in batch:
                        kw_name = k_info["keyword"]
                        query_kw = TOPIC_QUERY_MAP.get(kw_name, kw_name)
                        keyword_groups.append({
                            "groupName": kw_name,
                            "keywords": [query_kw]
                        })
                    
                    # 30일치 일별 데이터 조회 (오늘 기준 hourly 스코어 baseline 계산용)
                    daily_res = call_naver_api("https://openapi.naver.com/v1/datalab/search", body={
                        "startDate": thirty_days_ago_str,
                        "endDate": today_str,
                        "timeUnit": "date",
                        "keywordGroups": keyword_groups
                    })
                    
                    for k_info in batch:
                        kw = k_info["keyword"]
                        cat = k_info["category"]
                        traffic = k_info["traffic"]
                        
                        # 중복 누적을 차단하기 위해 이 키워드의 기존 DB 기록을 먼저 지웁니다.
                        cursor.execute("DELETE FROM trends WHERE keyword = ?", (kw,))
                        
                        # 오늘 기준 실시간 트렌드 분석에만 집중하므로 월간/일별 DB 직접 적재는 생략
                                            
                        # 3) 오늘 기준 시간별 데이터 적재 (24시간 분량, 미세 오프셋 추가)
                        last_ratio = 50.0
                        if daily_res and "results" in daily_res:
                            for res in daily_res["results"]:
                                if res["title"] == kw and res.get("data"):
                                    last_ratio = float(res["data"][-1]["ratio"])
                                    
                        base_score = 100.0 + last_ratio * 8.5
                        for h in range(24):
                            t_time = now_utc - datetime.timedelta(hours=24 - h)
                            t_str = t_time.strftime('%Y-%m-%d %H:00:00')
                            score = base_score + (hash(kw + str(h)) % 24 - 12)
                            score = max(100, min(995, score))
                            
                            cursor.execute("SELECT COUNT(*) FROM trends WHERE keyword = ? AND timestamp = ?", (kw, t_str))
                            if cursor.fetchone()[0] == 0:
                                cursor.execute(
                                    "INSERT INTO trends (keyword, category, score, traffic, timestamp) VALUES (?, ?, ?, ?, ?)",
                                    (kw, cat, score, traffic, t_str)
                                )
            else:
                print("[배치 스케줄러] 네이버 API 키가 연동되지 않았습니다. 시뮬레이션 모드로 동기화합니다.")
                now_utc = datetime.datetime.now(datetime.timezone.utc)
                for k_info in keywords_list:
                    kw = k_info["keyword"]
                    cat = k_info["category"]
                    traffic = k_info["traffic"]
                    idx = k_info["idx"]
                    
                    # 중복 누적을 차단하기 위해 이 키워드의 기존 DB 기록을 먼저 지웁니다.
                    cursor.execute("DELETE FROM trends WHERE keyword = ?", (kw,))
                    
                    base_score = 500 + min(400, traffic / 250) + (20 - idx) * 5
                    base_score = min(995, base_score)
                    
                    # 시뮬레이션 모드에서도 오늘 실시간 데이터만 적재
                    
                    # 3) 오늘 24시간
                    for h in range(24):
                        t_time = now_utc - datetime.timedelta(hours=24 - h)
                        t_str = t_time.strftime('%Y-%m-%d %H:00:00')
                        score = base_score + (hash(kw + str(h)) % 20 - 10)
                        score = max(100, min(995, score))
                        cursor.execute(
                            "INSERT INTO trends (keyword, category, score, traffic, timestamp) VALUES (?, ?, ?, ?, ?)",
                            (kw, cat, score, traffic, t_str)
                        )

            # 3단계: 뉴스 피드 동기화 (네이버 뉴스 API 혹은 구글 뉴스 RSS 폴백)
            cursor.execute("DELETE FROM news")
            news_loaded = False
            
            if client_id and client_secret and keywords_list:
                print("[배치 스케줄러] 네이버 뉴스 API를 사용해 실시간 관련 뉴스를 동기화합니다...")
                news_count = 0
                for k_info in keywords_list[:5]: # 상위 5개 주요 검색어 위주로 뉴스 검색
                    kw = k_info["keyword"]
                    news_data = call_naver_api("https://openapi.naver.com/v1/search/news.json", params={
                        "query": kw,
                        "display": 3,
                        "sort": "sim"
                    })
                    if news_data and "items" in news_data:
                        for item in news_data["items"]:
                            title = item.get("title", "")
                            # Naver API 뉴스 타이틀에 포함된 HTML 태그 (<b> 등) 제거
                            title = re.sub(r'<[^>]+>', '', title)
                            title = html.unescape(title)
                            link = item.get("link", "")
                            pub_date = item.get("pubDate", "")
                            
                            cursor.execute(
                                "INSERT INTO news (title, source, link, pub_date) VALUES (?, ?, ?, ?)",
                                (title, "네이버뉴스", link, pub_date)
                            )
                            news_count += 1
                            if news_count >= 15:
                                break
                    if news_count >= 15:
                        break
                if news_count > 0:
                    news_loaded = True
            
            if not news_loaded:
                print("[배치 스케줄러] 구글 뉴스 KR RSS 피드를 통해 속보를 동기화합니다...")
                req_news = urllib.request.Request(
                    'https://news.google.com/rss?hl=ko&gl=KR&ceid=KR:ko',
                    headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}
                )
                with urllib.request.urlopen(req_news, timeout=10) as response:
                    news_xml = response.read()
                    
                news_root = ET.fromstring(news_xml)
                news_items = news_root.findall('.//item')
                
                for news in news_items[:15]:
                    title = news.find('title').text
                    link = news.find('link').text
                    pub_date = news.find('pubDate').text
                    
                    title = html.unescape(title)
                    parts = title.split(' - ')
                    source = "속보"
                    if len(parts) > 1:
                        source = parts.pop()
                        title = ' - '.join(parts)
                        
                    cursor.execute(
                        "INSERT INTO news (title, source, link, pub_date) VALUES (?, ?, ?, ?)",
                        (title, source, link, pub_date)
                    )
            
            # --- 다. 1년이 지난 오랜 로그 청소 (디스크 낭비 방지) ---
            cursor.execute("DELETE FROM trends WHERE timestamp < datetime('now', '-365 day')")
            
            conn.commit()
            conn.close()
            print(f"[배치 스케줄러] 구글/네이버 트렌드 및 뉴스 동기화 완료: {datetime.datetime.now(datetime.timezone.utc)}")
            
        except Exception as e:
            print(f"[배치 스케줄러 ERROR] 크롤링 및 네이버 API 연동 오류 발생: {e}")
            
        # 60초 대기
        time.sleep(60)

# 4. HTTP 요청 REST API 라우터 구현
class TrendHTTPHandler(BaseHTTPRequestHandler):
    def end_headers(self):
        # 배포 시 및 크로스 도메인 연동을 대비한 CORS 설정 기본 탑재
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        # 가. REST API 라우트 분기
        if self.path.startswith('/api/trends'):
            self.handle_api_trends()
        elif self.path.startswith('/api/news'):
            self.handle_api_news()
        elif self.path.startswith('/api/report'):
            self.handle_api_report()
        else:
            # 나. 스태틱 파일 핸들링 (HTML/CSS/JS/이미지 리소스를 로컬 상대경로 안전 서빙)
            self.handle_static_files()

    # REST API 1: /api/trends?period=...
    def handle_api_trends(self):
        try:
            # 쿼리 파라미터 파싱
            query_params = {}
            if '?' in self.path:
                _, query_str = self.path.split('?', 1)
                for param in query_str.split('&'):
                    if '=' in param:
                        k, v = param.split('=', 1)
                        query_params[k] = urllib.parse.unquote(v)
            
            period = query_params.get('period', 'today')
            
            # 오늘(24시간) 기준 실시간 단일 분석으로 고정
            time_filter = "-24 hour"
            group_expr = "strftime('%Y-%m-%d %H:00', datetime(timestamp, 'localtime'))"
            label_expr = "strftime('%H:00', datetime(timestamp, 'localtime'))"
            history_limit = 15

            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # 1단계: 선택 기간 동안의 평균 스코어가 가장 높은 고유 키워드 20개 선정
            cursor.execute(f'''
                SELECT keyword, category, AVG(traffic) as avg_traffic, AVG(score) as avg_score
                FROM trends
                WHERE timestamp >= datetime('now', ?)
                GROUP BY keyword
                ORDER BY avg_score DESC
                LIMIT 20
            ''', (time_filter,))
            rows = cursor.fetchall()
            
            # 데이터 수집 대기 상태일 때 전체에서 가져옴
            if not rows:
                cursor.execute('''
                    SELECT keyword, category, AVG(traffic) as avg_traffic, AVG(score) as avg_score
                    FROM trends
                    GROUP BY keyword
                    ORDER BY timestamp DESC
                    LIMIT 20
                ''')
                rows = cursor.fetchall()

            result = []
            for idx, row in enumerate(rows):
                keyword, category, traffic, last_time = row
                traffic = int(traffic) if traffic else 0
                
                # 2단계: 각 키워드별 시계열 히스토리 조회 (과거 -> 현재 오름차순 정렬)
                cursor.execute(f'''
                    SELECT AVG(score) as avg_score, {label_expr} as lbl, {group_expr} as grp
                    FROM trends
                    WHERE keyword = ? AND timestamp >= datetime('now', ?)
                    GROUP BY grp
                    ORDER BY grp DESC
                    LIMIT ?
                ''', (keyword, time_filter, history_limit))
                history_rows = cursor.fetchall()
                history_rows.reverse()
                history = [h[0] for h in history_rows]
                labels = [h[1] for h in history_rows]
                
                if not history:
                    history = [last_time]
                    labels = ["LIVE" if period == "today" else "현재"]
                
                # 3단계: 연관 단어 매핑 목록 가져오기
                cursor.execute("SELECT word FROM related_words WHERE keyword_name = ? LIMIT 5", (keyword,))
                related_rows = cursor.fetchall()
                related = [r[0] for r in related_rows]
                
                if not related:
                    related = ["실시간", "인기 검색", "주요 토픽", "속보"]

                current_score = history[-1] if history else 500.0

                result.append({
                    "id": f"db-kw-{idx}-{category}",
                    "name": keyword,
                    "category": category,
                    "approxTraffic": traffic,
                    "trendScore": current_score,
                    "history": history,
                    "labels": labels,
                    "related": related
                })
                
            conn.close()
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps(result, ensure_ascii=False).encode('utf-8'))
            
        except Exception as e:
            self.send_error_response(f"Trends API 에러: {str(e)}")

    # REST API 2: /api/news
    def handle_api_news(self):
        try:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute("SELECT title, source, link, pub_date FROM news ORDER BY id ASC LIMIT 10")
            rows = cursor.fetchall()
            conn.close()
            
            result = []
            for row in rows:
                title, source, link, pub_date = row
                result.append({
                    "title": title,
                    "source": source,
                    "link": link,
                    "pubDate": pub_date
                })
                
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps(result, ensure_ascii=False).encode('utf-8'))
            
        except Exception as e:
            self.send_error_response(f"News API 에러: {str(e)}")

    # REST API 3: /api/report
    def handle_api_report(self):
        try:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            
            # 전체 트렌드 갯수 및 평균 스코어, 최고 스코어 계산
            cursor.execute("SELECT keyword, MAX(score) as max_s, category FROM trends GROUP BY keyword ORDER BY max_s DESC LIMIT 1")
            top_row = cursor.fetchone()
            
            cursor.execute("SELECT category, COUNT(*) as cnt FROM trends GROUP BY category ORDER BY cnt DESC LIMIT 1")
            top_cat_row = cursor.fetchone()
            
            cursor.execute("SELECT AVG(score) FROM trends")
            avg_score = cursor.fetchone()[0] or 0
            
            conn.close()
            
            category_ko = {'search': '검색 트렌드', 'social': '소셜 버즈', 'shopping': '쇼핑/소비', 'content': '미디어/콘텐츠'}
            
            report = {
                "timestamp": datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                "topKeyword": top_row[0] if top_row else "집계중",
                "topKeywordScore": top_row[1] if top_row else 0,
                "topCategory": category_ko.get(top_cat_row[0], "검색 트렌드") if top_cat_row else "검색 트렌드",
                "avgScore": round(avg_score, 2)
            }
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.end_headers()
            self.wfile.write(json.dumps(report, ensure_ascii=False).encode('utf-8'))
            
        except Exception as e:
            self.send_error_response(f"Report API 에러: {str(e)}")

    def send_error_response(self, msg):
        self.send_response(500)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.end_headers()
        self.wfile.write(json.dumps({"error": msg}, ensure_ascii=False).encode('utf-8'))

    # 스태틱 리소스 서빙 (index.html, css/style.css, js/*.js)
    def handle_static_files(self):
        # 요청 주소 디코딩 및 상대 경로 바인딩
        req_path = urllib.parse.unquote(self.path).split('?')[0]
        if req_path == '/':
            req_path = '/index.html'
            
        # 경로 인젝션 공격 방어를 위한 보안 검증 (노멀라이징)
        file_path = os.path.normpath(os.path.join(BASE_DIR, req_path.lstrip('/')))
        
        # 파일이 BASE_DIR 하위에 확실하게 속해있는지 검증
        if not file_path.startswith(BASE_DIR):
            self.send_response(403)
            self.end_headers()
            self.wfile.write(b"Forbidden")
            return
            
        if os.path.exists(file_path) and os.path.isfile(file_path):
            # 마임타입 감지
            mime_types = {
                '.html': 'text/html; charset=utf-8',
                '.css': 'text/css; charset=utf-8',
                '.js': 'application/javascript; charset=utf-8',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.gif': 'image/gif',
                '.svg': 'image/svg+xml',
                '.ico': 'image/x-icon'
            }
            _, ext = os.path.splitext(file_path)
            content_type = mime_types.get(ext.lower(), 'application/octet-stream')
            
            try:
                with open(file_path, 'rb') as f:
                    content = f.read()
                self.send_response(200)
                self.send_header('Content-Type', content_type)
                self.send_header('Content-Length', len(content))
                self.end_headers()
                self.wfile.write(content)
            except Exception as e:
                self.send_response(500)
                self.end_headers()
                self.wfile.write(f"Internal Server Error: {str(e)}".encode())
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"404 Not Found")

# 5. 서버 가동 및 데몬 스레드 구동 진입점
def run():
    # 데이터베이스 최초 빌드
    init_db()
    
    # 60초 주기 웹 수집 배치 엔진을 별도 데몬 스레드로 가동
    t = threading.Thread(target=scrape_rss_feeds)
    t.daemon = True
    t.start()
    
    # 웹 서버 포트 8080 고정 기동
    server_address = ('', 8080)
    
    # 소켓 재사용 옵션을 주어 프로세스 재기동 시 포트 점유 충돌 방지
    class ReusableTCPServer(socketserver.TCPServer):
        allow_reuse_address = True
        
    try:
        httpd = ReusableTCPServer(server_address, TrendHTTPHandler)
        print("====================================================")
        print("    TrendPulse 통합 백엔드 & DB 서버 가동 시작")
        print("    접속 주소: http://localhost:8080")
        print("====================================================")
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[서버 종료] 서버를 안전하게 종료합니다.")
        sys.exit(0)

if __name__ == '__main__':
    run()

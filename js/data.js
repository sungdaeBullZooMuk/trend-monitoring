// TrendPulse - Live API Data Engine (js/data.js)

(function(global) {
  'use strict';

  // API 호출 실패 시 활용할 로컬 폴백 데이터베이스 (안전성 보장)
  const OFFLINE_FALLBACK_DATABASE = [
    { name: 'K-푸드 수출액 역대 최고', category: 'search', traffic: 120000, related: ['냉동김밥', '라면 수출', '김치 대란', '글로벌 한식', '미국 마트'] },
    { name: '실시간 AI 통역 서비스 출시', category: 'search', traffic: 98000, related: ['온디바이스 AI', '스마트폰 번역', '음성 인식', '외국어 공부', 'LLM'] },
    { name: '탕후루 대체 제로 디저트', category: 'social', traffic: 89000, related: ['제로 슈가', '요거트 아이스크림', '디저트 카페', '혈당 관리', '대체 감미료'] },
    { name: '올인원 로봇청소기 대란', category: 'shopping', traffic: 85000, related: ['가사 해방', '자동 먼지 비움', '신혼 필수품', '스마트 가전', '로봇청소기 추천'] },
    { name: '두뇌 서바이벌 예능 넷플릭스 1위', category: 'content', traffic: 82000, related: ['서바이벌 예능', '추리 게임', '플레이어 분석', '유튜브 리뷰', '주말 정주행'] },
    { name: '성수동 로컬 팝업 스토어 오픈런', category: 'social', traffic: 79000, related: ['브랜드 경험', '대기 줄', '인스타그램 핫플', '성수동 가볼만한곳', '한정 굿즈'] },
    { name: '가정용 스마트 팜 보급', category: 'search', traffic: 72000, related: ['식물 재배기', '홈 가드닝', '유기농 채소', '수경 재배', '스마트 가전'] },
    { name: 'Y2K 세기말 패션 트렌드', category: 'social', traffic: 68000, related: ['카고팬츠', '실버 주얼리', '헤드폰 코디', '빈티지 샵', '레트로 감성'] },
    { name: '홈 바 믹솔로지 위스키', category: 'shopping', traffic: 64000, related: ['하이볼 레시피', '싱글 몰트', '편의점 위스키', '퇴근 후 혼술', '칵테일 DIY'] },
    { name: '초단기 긱워커 플랫폼 유행', category: 'search', traffic: 58000, related: ['N잡러', '배달 알바', '주말 부업', '긱 이코노미', '근로 소득'] },
    { name: '버추얼 아이돌 지상파 차트인', category: 'content', traffic: 52000, related: ['3D 아바타', '스트리머', '팬덤 문화', '음원 순위', '메타버스'] },
    { name: '미니멀 차박 캠핑 용품', category: 'shopping', traffic: 49000, related: ['글램핑', '캠핑카', '야외 조명', '감성 캠핑', '폴딩 박스'] }
  ];

  class LiveTrendEngine {
    constructor() {
      this.keywords = [];
      this.newsFeeds = []; // 실제 최신 뉴스 기사 보관소
      this.alerts = [];
      this.historyLength = 15;
      this.currentCategory = 'all';
      this.currentPeriod = 'today'; // 추가: 오늘/1주/1달/1년 기간 필터
      this.isLoading = false;
      this.isOffline = false;
      this.init();
    }

    init() {
      // 최초에는 빈 상태로 시작하며, App 구동 시 fetch API 호출 예정
    }

    // HTML Entity 디코더 유틸 (Google Trends RSS description 내의 HTML 기사 파싱용)
    decodeHtml(html) {
      const txt = document.createElement('textarea');
      txt.innerHTML = html;
      return txt.value;
    }

    // SQLite DB 백엔드로부터 실시간 트렌드 데이터 수집
    async fetchRealTrends() {
      this.isLoading = true;
      
      try {
        const response = await fetch(`/api/trends?period=${this.currentPeriod}`);
        if (!response.ok) throw new Error('백엔드 API 응답 오류');
        
        const data = await response.json();
        if (!data || data.length === 0) {
          throw new Error('파싱된 트렌드 데이터 없음');
        }

        this.isOffline = false;
        // 백엔드가 완벽하게 가공하여 반환한 스키마 구조 그대로 반영
        this.keywords = data;
        
      } catch (error) {
        console.warn('실시간 백엔드 데이터 로드 실패. 오프라인 폴백 모드로 전환합니다.', error);
        this.isOffline = true;
        this.processFallbackData();
      } finally {
        this.isLoading = false;
        // 완료 이벤트 디스패치
        window.dispatchEvent(new CustomEvent('trendDataLoaded'));
      }
    }

    // SQLite DB 백엔드로부터 실시간 뉴스 속보 수집
    async fetchRealNews() {
      try {
        const response = await fetch('/api/news');
        if (!response.ok) throw new Error('백엔드 뉴스 API 응답 오류');
        
        const data = await response.json();
        if (data && data.length > 0) {
          this.newsFeeds = data.map(item => {
            return {
              title: item.title,
              source: item.source,
              link: item.link,
              pubDate: item.pubDate,
              timestamp: new Date(item.pubDate).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
            };
          });
        }
      } catch (error) {
        console.warn('실시간 뉴스 API 수집 실패:', error);
      }
    }

    // 외부 구글 트렌드 JSON 객체를 우리 애플리케이션 스키마로 가공
    processTrendsData(apiItems) {
      const newKeywords = [];
      const categories = ['search', 'social', 'shopping', 'content'];

      apiItems.forEach((item, index) => {
        const name = item.title;
        // 인덱스를 기준으로 카테고리 고르게 배분
        const category = categories[index % categories.length];
        
        // 검색 횟수(Traffic) 파싱 시도 (예: "50,000+" 혹은 "5,000+")
        let approxTraffic = 5000;
        if (item.description) {
          const trafficMatch = item.description.match(/([0-9,]+)\+/);
          if (trafficMatch) {
            approxTraffic = parseInt(trafficMatch[1].replace(/,/g, ''));
          }
        }
        
        // 트렌드 기본 점수 설정 (트래픽 반영 + 인덱스 보정)
        // 최대 약 1000점 범위로 스케일 조정
        let baseScore = 500 + Math.min(400, approxTraffic / 250) + (20 - index) * 5;
        baseScore = Math.min(995, baseScore);

        // 연관 뉴스 기사 제목에서 연관 검색어/태그 추출
        let relatedList = [];
        if (item.description) {
          const decoded = this.decodeHtml(item.description);
          // HTML 링크 앵커 텍스트 추출 (뉴스 기사 제목들)
          const regex = /<a[^>]*>([^<]+)<\/a>/g;
          let match;
          while ((match = regex.exec(decoded)) !== null) {
            const cleanTitle = match[1].replace(/[\[\]"']/g, '').trim();
            // 기사 제목에서 2~4글자짜리 짧은 키워드들을 추출하거나 통째로 넣기
            if (cleanTitle.length > 2) {
              // 문장 구절에서 몇몇 어절 추출
              const words = cleanTitle.split(' ').filter(w => w.length >= 2 && w.length <= 6);
              relatedList.push(...words.slice(0, 2));
            }
          }
        }
        
        // 중복 제거 및 너무 일반적인 조사 필터링
        relatedList = [...new Set(relatedList)].filter(w => !['있다', '대한', '속보', '종합', '단독', '기자', '뉴스'].includes(w));
        
        // 연관 단어가 너무 적으면 가상의 연관어로 보강
        if (relatedList.length < 4) {
          const defaultRelated = {
            search: ['급상승 키워드', '실시간 포털', '상세 뉴스', '트렌드 분석'],
            social: ['인스타그램 해시태그', 'X 리트윗', '네티즌 반응', '핫 토픽'],
            shopping: ['최저가 검색', '기획전 특가', '선호 브랜드', '주문 폭주'],
            content: ['유튜브 급상승', '인기 스트리밍', '시청 소감', '실시간 감상']
          };
          relatedList.push(...defaultRelated[category]);
        }
        relatedList = relatedList.slice(0, 5); // 최대 5개 노드 제한

        // 기존에 존재하던 동일 키워드가 있었다면, 히스토리(history)를 상속하여 꺾은선 그래프가 이어지도록 머지
        const existing = this.keywords.find(k => k.name === name);
        let history = [];
        
        if (existing) {
          history = [...existing.history];
          history.push(baseScore);
          if (history.length > this.historyLength) history.shift();
        } else {
          // 최초 생성 시 더미 히스토리 채움
          let score = baseScore;
          for (let i = 0; i < this.historyLength; i++) {
            score += Math.floor(Math.random() * 11) - 5;
            history.push(score);
          }
        }

        newKeywords.push({
          id: `live-${index}-${category}`,
          name: name,
          category: category,
          approxTraffic: approxTraffic,
          trendScore: baseScore,
          prevRank: existing ? existing.rank : 0,
          rank: index + 1,
          history: history,
          delta: existing ? existing.delta : 0,
          related: relatedList
        });
      });

      this.keywords = newKeywords;
      this.calculateRanks();
    }

    // API 호출 실패 시 로컬 폴백 데이터로 스키마 빌드
    processFallbackData() {
      this.keywords = OFFLINE_FALLBACK_DATABASE.map((item, index) => {
        const history = [];
        let score = 500 + (item.traffic / 300);
        for (let i = 0; i < this.historyLength; i++) {
          score += Math.floor(Math.random() * 11) - 5;
          history.push(score);
        }
        return {
          id: `fallback-${index}-${item.category}`,
          name: item.name,
          category: item.category,
          approxTraffic: item.traffic,
          trendScore: score,
          prevRank: 0,
          rank: index + 1,
          history: history,
          delta: 0,
          related: item.related
        };
      });
      this.calculateRanks();
    }

    // 현재 점수 정렬 기반 최종 순위 계산 및 전 단계 순위 업데이트
    calculateRanks() {
      const sorted = [...this.keywords].sort((a, b) => b.trendScore - a.trendScore);
      sorted.forEach((kw, index) => {
        const found = this.keywords.find(k => k.id === kw.id);
        if (found) {
          found.prevRank = found.rank || index + 1;
          found.rank = index + 1;
        }
      });
    }

    // 2.5초 주기 실시간 미세 트래픽 변동 시뮬레이션
    // 구글 트렌드 검색량 기준에 미세 노이즈를 섞어 차트의 라이브 생동감을 줍니다.
    updateMicroValues() {
      if (this.keywords.length === 0 || this.currentPeriod !== 'today') return;

      this.keywords.forEach(kw => {
        // 미세 점수 섭동 (-12 ~ +16)
        const change = Math.floor(Math.random() * 29) - 12;
        kw.trendScore = Math.max(100, kw.trendScore + change);
        
        kw.history.push(kw.trendScore);
        if (kw.history.length > this.historyLength) {
          kw.history.shift();
        }

        const prevScore = kw.history[kw.history.length - 2] || kw.trendScore;
        kw.delta = ((kw.trendScore - prevScore) / prevScore) * 100;
      });

      this.calculateRanks();

      const event = new CustomEvent('trendMicroUpdate', { detail: this.getTopKeywords(this.currentCategory, 10) });
      window.dispatchEvent(event);
    }

    // 15초 주기 데이터 수동 동기화 및 급상승 감지 로직
    updatePeriodicRanks() {
      if (this.keywords.length === 0 || this.currentPeriod !== 'today') return;

      const alertsGenerated = [];

      this.keywords.forEach(kw => {
        // 주기적 업데이트 시 스포트라이트/조회수 폭발 시뮬레이션 (3% 확률)
        const isSpike = Math.random() < 0.03;
        let surgePercent = 0;

        if (isSpike) {
          const spikeBoost = Math.floor(Math.random() * 110) + 60; // +60 ~ +170 급등
          kw.trendScore += spikeBoost;
          
          const prevScore = kw.history[kw.history.length - 3] || kw.history[0];
          surgePercent = ((kw.trendScore - prevScore) / prevScore) * 100;

          // 알림 발송 객체 등록
          const alert = {
            id: Date.now() + Math.random().toString(36).substr(2, 5),
            keywordId: kw.id,
            keywordName: kw.name,
            category: kw.category,
            percent: Math.round(surgePercent),
            score: kw.trendScore,
            timestamp: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            read: false
          };
          this.alerts.unshift(alert);
          alertsGenerated.push(alert);

          if (this.alerts.length > 20) this.alerts.pop();
        } else {
          // 일상적 변동 (-20 ~ +30)
          const change = Math.floor(Math.random() * 51) - 20;
          kw.trendScore = Math.max(100, kw.trendScore + change);
        }

        kw.history.push(kw.trendScore);
        if (kw.history.length > this.historyLength) {
          kw.history.shift();
        }
      });

      this.calculateRanks();

      // UI 갱신 이벤트 발송
      const rankEvent = new CustomEvent('trendRankUpdate', { 
        detail: {
          rankings: this.getTopKeywords(this.currentCategory, 10),
          alerts: alertsGenerated
        }
      });
      window.dispatchEvent(rankEvent);

      // 개별 토스트 알림 발송
      alertsGenerated.forEach(alert => {
        window.dispatchEvent(new CustomEvent('trendSpikeDetected', { detail: alert }));
      });
    }

    setCategory(category) {
      this.currentCategory = category;
      const event = new CustomEvent('trendCategoryChange', { detail: this.getTopKeywords(category, 10) });
      window.dispatchEvent(event);
    }

    getTopKeywords(category, limit = 10) {
      let filtered = this.keywords;
      if (category && category !== 'all') {
        filtered = this.keywords.filter(k => k.category === category);
      }
      return [...filtered]
        .sort((a, b) => b.trendScore - a.trendScore)
        .slice(0, limit);
    }

    getKeywordDetails(id) {
      return this.keywords.find(k => k.id === id);
    }

    generateReportData() {
      if (this.keywords.length === 0) {
        return {
          timestamp: new Date().toLocaleString('ko-KR'),
          topKeyword: '데이터 없음',
          topKeywordScore: 0,
          topCategory: '없음',
          topCategoryCount: 0,
          avgVolatility: '0%',
          categoryBest: {},
          top3Keywords: []
        };
      }

      const sortedByScore = [...this.keywords].sort((a, b) => b.trendScore - a.trendScore);
      const topKeyword = sortedByScore[0];

      // 상위 10개 기준 카테고리 쉐어
      const top10 = sortedByScore.slice(0, 10);
      const categoryCounts = { search: 0, social: 0, shopping: 0, content: 0 };
      top10.forEach(k => {
        categoryCounts[k.category] = (categoryCounts[k.category] || 0) + 1;
      });

      let topCategory = 'search';
      let maxCount = 0;
      const categoryMapKo = { search: '검색 트렌드', social: '소셜 버즈', shopping: '쇼핑/소비', content: '미디어/콘텐츠' };
      
      for (const cat in categoryCounts) {
        if (categoryCounts[cat] > maxCount) {
          maxCount = categoryCounts[cat];
          topCategory = cat;
        }
      }

      const totalVolatility = this.keywords.reduce((acc, kw) => acc + Math.abs(kw.delta), 0);
      const avgVolatility = (totalVolatility / this.keywords.length).toFixed(2);

      const categoryBest = {};
      ['search', 'social', 'shopping', 'content'].forEach(cat => {
        const catKws = this.keywords.filter(k => k.category === cat).sort((a, b) => b.trendScore - a.trendScore);
        if (catKws.length > 0) {
          categoryBest[cat] = catKws[0].name;
        }
      });

      return {
        timestamp: new Date().toLocaleString('ko-KR'),
        topKeyword: topKeyword.name,
        topKeywordScore: topKeyword.trendScore,
        topCategory: categoryMapKo[topCategory],
        topCategoryCount: maxCount,
        avgVolatility: avgVolatility + '%',
        categoryBest: categoryBest,
        top3Keywords: sortedByScore.slice(0, 3).map((k, idx) => ({ rank: idx + 1, name: k.name, score: k.trendScore, category: categoryMapKo[k.category] }))
      };
    }
  }

  global.TrendEngine = new LiveTrendEngine();

})(window);

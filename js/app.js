// TrendPulse - Application Initializer (js/app.js)

(function(global) {
  'use strict';

  class TrendApp {
    constructor() {
      this.init();
    }

    init() {
      // DOM 로드가 완전히 완료되었거나 스크립트가 로드되었을 때 실행
      document.addEventListener('DOMContentLoaded', () => this.start());
      
      // 혹시 이미 DOMContentLoaded가 지난 경우 바로 실행
      if (document.readyState === 'interactive' || document.readyState === 'complete') {
        this.start();
      }
    }

    start() {
      if (this.started) return;
      this.started = true;

      // 로딩 엘리먼트 참조
      const loadingOverlay = document.getElementById('loading-overlay');

      // 1. 실시간 데이터 로드 완료 이벤트 구독
      window.addEventListener('trendDataLoaded', () => {
        if (loadingOverlay) {
          loadingOverlay.classList.add('fade-out');
          setTimeout(() => {
            loadingOverlay.style.display = 'none';
          }, 500);
        }

        // 초기 화면 렌더링
        const initialRankings = global.TrendEngine.getTopKeywords('all');
        global.TrendUI.renderRankings(initialRankings);
        global.TrendUI.renderAlertsFeed();
        global.TrendUI.renderSummaryStats();
      });

      // 2. 비동기 실시간 API 최초 호출
      (async () => {
        // 병렬로 API 호출 진행
        await Promise.all([
          global.TrendEngine.fetchRealTrends(),
          global.TrendEngine.fetchRealNews()
        ]);
      })();

      // 3. 타이머 인터벌 가동
      // 실시간 미세 변동 시뮬레이션 (2.5초 간격)
      this.microInterval = setInterval(() => {
        global.TrendEngine.updateMicroValues();
      }, 2500);

      // 주기적 순위 갱신 및 스파이크 감지 (15초 간격)
      this.periodicInterval = setInterval(() => {
        global.TrendEngine.updatePeriodicRanks();
      }, 15000);

      // 실제 구글 API 백그라운드 재동기화 폴링 (60초 간격)
      this.apiSyncInterval = setInterval(async () => {
        await global.TrendEngine.fetchRealTrends();
        await global.TrendEngine.fetchRealNews();
      }, 60000);

      // 4. 네비게이션 이벤트 리스너 바인딩 (기간 단일 고정)

      const navItems = document.querySelectorAll('.nav-item');
      navItems.forEach(item => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          
          // 액티브 클래스 전환
          navItems.forEach(nav => nav.classList.remove('active'));
          item.classList.add('active');

          // 카테고리 필터링 적용
          const category = item.dataset.category;
          global.TrendEngine.setCategory(category);
        });
      });

      // 4. 모달 관련 이벤트 바인딩
      const btnReport = document.getElementById('btn-generate-report');
      const btnCloseReport = document.getElementById('btn-close-report');
      const reportModal = document.getElementById('report-modal');
      const btnCopyReport = document.getElementById('btn-copy-report');
      const btnDownloadReport = document.getElementById('btn-download-report');

      if (btnReport) {
        btnReport.addEventListener('click', () => {
          global.TrendUI.openReportModal();
        });
      }

      if (btnCloseReport) {
        btnCloseReport.addEventListener('click', () => {
          reportModal.close();
        });
      }

      // 모달 바깥 백드롭 영역 클릭 시 모달 닫기
      if (reportModal) {
        reportModal.addEventListener('click', (e) => {
          const rect = reportModal.getBoundingClientRect();
          const isInModal = (
            rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
            rect.left <= e.clientX && e.clientX <= rect.left + rect.width
          );
          if (!isInModal) {
            reportModal.close();
          }
        });
      }

      // 리포트 텍스트 클립보드 복사
      if (btnCopyReport) {
        btnCopyReport.addEventListener('click', () => {
          const stats = global.TrendEngine.generateReportData();
          const reportText = `[TrendPulse 트렌드 분석 보고서]
작성 일시: ${stats.timestamp}
1. 최고 상승 트렌드: ${stats.topKeyword} (${Math.round(stats.topKeywordScore)}pt)
2. 점유율 1위 카테고리: ${stats.topCategory} (상위 15개 중 ${stats.topCategoryCount}개)
3. 평균 트렌드 변동성: ${stats.avgVolatility}
4. 카테고리별 대표 트렌드:
   - 검색 트렌드: ${stats.categoryBest.search || '-'}
   - 소셜 버즈: ${stats.categoryBest.social || '-'}
   - 쇼핑/소비: ${stats.categoryBest.shopping || '-'}
   - 미디어/콘텐츠: ${stats.categoryBest.content || '-'}
* 본 보고서는 TrendPulse 실시간 분석 모듈에 의해 자동 생성되었습니다.`;

          navigator.clipboard.writeText(reportText)
            .then(() => {
              // 복사 완료 피드백을 모달 푸터 및 토스트로 제공
              btnCopyReport.textContent = '복사 완료!';
              btnCopyReport.style.borderColor = 'var(--neon-green)';
              btnCopyReport.style.color = 'var(--neon-green)';
              
              global.TrendUI.showToastAlert({
                category: 'search',
                customMsg: '보고서 텍스트가 클립보드에 성공적으로 복사되었습니다!'
              });

              setTimeout(() => {
                btnCopyReport.textContent = '클립보드에 복사';
                btnCopyReport.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                btnCopyReport.style.color = 'white';
              }, 2000);
            })
            .catch(err => {
              console.error('클립보드 복사 실패:', err);
            });
        });
      }

      // 리포트 PDF 저장 동작 (파일 다운로드 모의 처리)
      if (btnDownloadReport) {
        btnDownloadReport.addEventListener('click', () => {
          const stats = global.TrendEngine.generateReportData();
          
          // 보고서 파일 내용 준비
          const fileContent = `=========================================
      TrendPulse TREND ANALYSIS REPORT
=========================================
Report Date: ${stats.timestamp}

1. OVERVIEW
-----------------------------------------
- Primary Hot Trend: ${stats.topKeyword} (${Math.round(stats.topKeywordScore)} pt)
- Market Leader Category: ${stats.topCategory} (Count: ${stats.topCategoryCount}/15)
- Average Market Volatility: ${stats.avgVolatility}

2. CATEGORY BREAKDOWN
-----------------------------------------
- Search Engine Volume: ${stats.categoryBest.search || 'N/A'}
- Social Media Mentions: ${stats.categoryBest.social || 'N/A'}
- Shopping Cart Analytics: ${stats.categoryBest.shopping || 'N/A'}
- Entertainment & Media: ${stats.categoryBest.content || 'N/A'}

3. TOP 3 KEYWORDS DETAIL
-----------------------------------------
${stats.top3Keywords.map(k => `[Rank ${k.rank}] ${k.name} (${k.category}) - ${Math.round(k.score)} pt`).join('\n')}

=========================================
Generated automatically by TrendPulse Engine.
All Rights Reserved.
`;

          // blob 생성 후 텍스트 파일 (.txt) 다운로드 수행
          const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `TrendPulse_Report_${Date.now()}.txt`;
          document.body.appendChild(link);
          link.click();
          
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          
          global.TrendUI.showToastAlert({
            category: 'shopping',
            customMsg: '텍스트 리포트 다운로드가 시작되었습니다!'
          });
        });
      }
    }
  }

  // 앱 시동
  global.TrendApp = new TrendApp();

})(window);

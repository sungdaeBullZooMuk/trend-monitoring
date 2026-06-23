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

      // 테마 초기화 로직
      const themeToggle = document.getElementById('theme-toggle');
      const sunIcon = themeToggle ? themeToggle.querySelector('.sun-icon') : null;
      const moonIcon = themeToggle ? themeToggle.querySelector('.moon-icon') : null;
      
      const setTheme = (theme) => {
        if (theme === 'light') {
          document.documentElement.setAttribute('data-theme', 'light');
          if (sunIcon) sunIcon.style.display = 'none';
          if (moonIcon) moonIcon.style.display = 'block';
        } else {
          document.documentElement.removeAttribute('data-theme');
          if (sunIcon) sunIcon.style.display = 'block';
          if (moonIcon) moonIcon.style.display = 'none';
        }
        localStorage.setItem('theme', theme);
        // UI가 로드된 상태면 컬러 데이터 업데이트 및 재렌더링
        if (global.TrendUI && typeof global.TrendUI.updateThemeColors === 'function') {
          global.TrendUI.updateThemeColors();
          if (global.TrendEngine && global.TrendEngine.keywords.length > 0) {
            global.TrendUI.renderRankings(global.TrendEngine.getTopKeywords(global.TrendEngine.currentCategory, 10));
            global.TrendUI.renderLiveChart();
            global.TrendUI.renderSummaryStats();
            const selectedKw = global.TrendEngine.getKeywordDetails(global.TrendUI.selectedKeywordId);
            if (selectedKw) {
              global.TrendUI.triggerMapRebuild(selectedKw);
            }
          }
        }
      };

      // 시스템 기본 설정 및 저장된 설정에 따른 초기값 적용
      const savedTheme = localStorage.getItem('theme');
      const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
      if (savedTheme === 'light' || (!savedTheme && prefersLight)) {
        setTheme('light');
      } else {
        setTheme('dark');
      }

      if (themeToggle) {
        themeToggle.addEventListener('click', () => {
          const currentTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
          setTheme(currentTheme);
        });
      }

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
        
        // 테마 로드 이후 초기 동기화 완료 시 한 번 더 컬러 업데이트 진행
        if (global.TrendUI && typeof global.TrendUI.updateThemeColors === 'function') {
          global.TrendUI.updateThemeColors();
        }
        
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
      // 실시간 미세 변동 시뮬레이션 (5초 간격)
      this.microInterval = setInterval(() => {
        global.TrendEngine.updateMicroValues();
      }, 5000);

      // 주기적 순위 갱신 및 스파이크 감지 (15초 간격)
      this.periodicInterval = setInterval(() => {
        global.TrendEngine.updatePeriodicRanks();
      }, 15000);

      // 실제 네이버 API 백그라운드 재동기화 폴링 (60초 간격)
      this.apiSyncInterval = setInterval(async () => {
        await global.TrendEngine.fetchRealTrends();
        await global.TrendEngine.fetchRealNews();
      }, 60000);

      // 4. 네비게이션 이벤트 리스너 바인딩 (기간 단일 고정, 데스크톱 & 모바일 싱크)
      const navItems = document.querySelectorAll('.nav-item');
      navItems.forEach(item => {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          
          const category = item.dataset.category;
          
          // 데스크톱 및 모바일 네비게이션 활성화 싱크 맞춤
          navItems.forEach(nav => {
            if (nav.dataset.category === category) {
              nav.classList.add('active');
            } else {
              nav.classList.remove('active');
            }
          });

          // 카테고리 필터링 적용
          global.TrendEngine.setCategory(category);
        });
      });

      // 4. 모달 관련 이벤트 바인딩
      const btnReport = document.getElementById('btn-generate-report');
      const btnReportMobile = document.getElementById('btn-generate-report-mobile');
      const btnCloseReport = document.getElementById('btn-close-report');
      const reportModal = document.getElementById('report-modal');
      const btnCopyReport = document.getElementById('btn-copy-report');
      const btnDownloadReport = document.getElementById('btn-download-report');

      const handleReportOpen = () => {
        global.TrendUI.openReportModal();
      };

      if (btnReport) {
        btnReport.addEventListener('click', handleReportOpen);
      }
      if (btnReportMobile) {
        btnReportMobile.addEventListener('click', handleReportOpen);
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

      // My Info Modal Event Bindings
      const btnMyInfo = document.getElementById('btn-my-info');
      const btnCloseMyInfo = document.getElementById('btn-close-my-info');
      const btnConfirmMyInfo = document.getElementById('btn-confirm-my-info');
      const btnClearMyInfo = document.getElementById('btn-clear-my-info');
      const myInfoModal = document.getElementById('my-info-modal');

      if (btnMyInfo) {
        btnMyInfo.addEventListener('click', (e) => {
          e.preventDefault();
          global.TrendUI.openMyInfoModal();
        });
      }

      if (btnCloseMyInfo) {
        btnCloseMyInfo.addEventListener('click', () => {
          if (myInfoModal) myInfoModal.close();
        });
      }

      if (btnConfirmMyInfo) {
        btnConfirmMyInfo.addEventListener('click', () => {
          if (myInfoModal) myInfoModal.close();
        });
      }

      if (btnClearMyInfo) {
        btnClearMyInfo.addEventListener('click', () => {
          global.TrendUI.clearMyInfo();
        });
      }

      if (myInfoModal) {
        myInfoModal.addEventListener('click', (e) => {
          const rect = myInfoModal.getBoundingClientRect();
          const isInModal = (
            rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
            rect.left <= e.clientX && e.clientX <= rect.left + rect.width
          );
          if (!isInModal) {
            myInfoModal.close();
          }
        });
      }

      // 리포트 텍스트 클립보드 복사
      if (btnCopyReport) {
        btnCopyReport.addEventListener('click', () => {
          const stats = global.TrendEngine.generateReportData();
          const reportText = `[TrendPulse 실시간 트렌드 보고서]
보고서 생성 일시: ${stats.timestamp}

1. 실시간 최고 인기 트렌드: ${stats.topKeyword}
2. 점유율 1위 카테고리: ${stats.topCategory}
3. 대중 평균 긍정 여론 비율: ${stats.sentimentPositiveRate}%
4. 최대 버즈 소셜 채널: ${stats.hottestChannel}

5. 카테고리별 대표 트렌드:
   - 검색 트렌드: ${stats.categoryBest.search || '-'}
   - 소셜 버즈: ${stats.categoryBest.social || '-'}
   - 쇼핑/소비: ${stats.categoryBest.shopping || '-'}
   - 미디어/콘텐츠: ${stats.categoryBest.content || '-'}

* 본 보고서는 TrendPulse 실시간 AI 분석 엔진에 의해 자동 생성되었습니다.`;

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
      TrendPulse LIVE TREND ANALYSIS REPORT
=========================================
Report Date: ${stats.timestamp}

1. OVERVIEW
-----------------------------------------
- Primary Hot Trend: ${stats.topKeyword}
- Leader Category: ${stats.topCategory}
- Public Sentiment Positive Rate: ${stats.sentimentPositiveRate}%
- Max Buzz Social Channel: ${stats.hottestChannel}

2. CATEGORY BREAKDOWN
-----------------------------------------
- Search Volume Rank 1: ${stats.categoryBest.search || 'N/A'}
- Social Media Rank 1: ${stats.categoryBest.social || 'N/A'}
- Shopping Volume Rank 1: ${stats.categoryBest.shopping || 'N/A'}
- Media Content Rank 1: ${stats.categoryBest.content || 'N/A'}

3. TOP 3 KEYWORDS DETAIL
-----------------------------------------
${stats.top3Keywords.map(k => `[Rank ${k.rank}] ${k.name} (${k.category}) - ${k.approxTraffic.toLocaleString('ko-KR')} 검색`).join('\n')}

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

      // 5. 댓글 창 및 등록 이벤트 바인딩
      const commentForm = document.getElementById('comment-form');
      const commentAuthorInput = document.getElementById('comment-author');
      const commentPasswordInput = document.getElementById('comment-password');
      const commentContentInput = document.getElementById('comment-content');
      const btnCloseDrawer = document.getElementById('btn-close-drawer');

      if (btnCloseDrawer) {
        btnCloseDrawer.addEventListener('click', () => {
          global.TrendUI.closeCommentDrawer();
        });
      }

      // 입력창 포커싱 상태에 따른 갱신 락(Lock) 핸들러 바인딩
      const lockInputs = [commentAuthorInput, commentPasswordInput, commentContentInput];
      lockInputs.forEach(input => {
        if (input) {
          input.addEventListener('focus', () => {
            global.TrendUI.isCommentInputFocused = true;
          });
          input.addEventListener('blur', () => {
            global.TrendUI.isCommentInputFocused = false;
          });
        }
      });

      if (commentForm) {
        commentForm.addEventListener('submit', (e) => {
          e.preventDefault();

          const activeKw = global.TrendEngine.getKeywordDetails(global.TrendUI.selectedKeywordId);
          if (!activeKw) return;

          const author = commentAuthorInput.value.trim();
          const password = commentPasswordInput.value.trim();
          const content = commentContentInput.value.trim();

          if (!author || !password || !content) return;

          fetch('/api/comments', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              keyword: activeKw.name,
              author: author,
              content: content,
              password: password
            })
          })
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              // 닉네임 및 작성 댓글 정보 로컬 저장소에 동기화
              localStorage.setItem('my_nickname', author);
              
              let myComments = [];
              try {
                myComments = JSON.parse(localStorage.getItem('my_comments')) || [];
              } catch (err) {
                console.error('Failed to parse my_comments:', err);
              }
              myComments.push({
                id: data.comment_id,
                keyword: activeKw.name,
                content: content,
                timestamp: Date.now(),
                password: password
              });
              localStorage.setItem('my_comments', JSON.stringify(myComments));

              commentContentInput.value = '';
              commentPasswordInput.value = '';
              
              // 댓글 리스트 새로고침
              global.TrendUI.fetchComments(activeKw.name);
              
              global.TrendUI.showToastAlert({
                category: 'social',
                customMsg: '댓글이 성공적으로 등록되었습니다!'
              });
            } else {
              alert(data.error || '댓글 등록에 실패했습니다.');
            }
          })
          .catch(err => {
            console.error('댓글 등록 에러:', err);
          });
        });
      }
    }
  }

  // 앱 시동
  global.TrendApp = new TrendApp();

})(window);

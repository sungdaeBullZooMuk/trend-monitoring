// TrendPulse - Live API UI Renderer (js/ui.js)

(function(global) {
  'use strict';

  class TrendUI {
    constructor() {
      // DOM Elements
      this.rankingsList = document.getElementById('rankings-list');
      this.trendChartSvg = document.getElementById('trend-chart-svg');
      this.buzzContainer = document.getElementById('buzz-container');
      this.alertsList = document.getElementById('alerts-list');
      this.toastContainer = document.getElementById('toast-container');
      
      // Meta Elements
      this.liveClock = document.getElementById('live-clock');
      this.categoryTitle = document.getElementById('category-title');
      this.categoryDesc = document.getElementById('category-desc');
      this.rankTimeIndicator = document.getElementById('rank-time-indicator');
      this.chartFocusKeyword = document.getElementById('briefing-focus-keyword');
      this.mapTargetKeyword = document.getElementById('map-target-keyword');
      this.rankingsCardTitle = document.getElementById('rankings-card-title');
      this.chartCardTitle = document.getElementById('briefing-card-title');
      
      // Donut Chart Elements
      this.donutChartSvg = document.getElementById('donut-chart-svg');
      this.donutTotalCount = document.getElementById('donut-total-count');
      this.donutLegend = document.getElementById('donut-legend');
      
      // Stats Elements
      this.statTopKeyword = document.getElementById('stat-top-keyword');
      this.statAvgPosRate = document.getElementById('stat-avg-pos-rate');
      this.statHotChannel = document.getElementById('stat-hot-channel');
      
      // Modals
      this.reportModal = document.getElementById('report-modal');
      this.reportModalBody = document.getElementById('report-modal-body');
      
      // My Info Modals
      this.myInfoModal = document.getElementById('my-info-modal');
      this.myInfoNickname = document.getElementById('my-info-nickname');
      this.myInfoCommentCount = document.getElementById('my-info-comment-count');
      this.myInfoCommentsList = document.getElementById('my-info-comments-list');
      
      // Comments Elements
      this.commentDrawer = document.getElementById('comment-drawer');
      this.drawerKeywordName = document.getElementById('drawer-keyword-name');
      this.drawerCommentsList = document.getElementById('drawer-comments-list');
      
      // State variables
      this.selectedKeywordId = null;
      this.isCommentInputFocused = false;
      this.commentPollingInterval = null;
      this.categoryColors = {
        search: '#3b82f6',  // Slate Blue
        social: '#ec4899',  // Elegant Pink
        shopping: '#10b981',// Elegant Green
        content: '#f59e0b'  // Elegant Orange
      };
      
      // Canvas Network Map State
      this.canvas = document.getElementById('association-map');
      this.ctx = this.canvas.getContext('2d');
      this.nodes = [];
      this.links = [];
      this.draggedNode = null;
      this.mouse = { x: 0, y: 0, isDown: false };
      
      this.init();
    }

    updateThemeColors() {
      const rootStyles = getComputedStyle(document.documentElement);
      this.categoryColors = {
        search: rootStyles.getPropertyValue('--neon-blue').trim() || '#3b82f6',
        social: rootStyles.getPropertyValue('--neon-pink').trim() || '#ec4899',
        shopping: rootStyles.getPropertyValue('--neon-green').trim() || '#10b981',
        content: rootStyles.getPropertyValue('--neon-orange').trim() || '#f59e0b'
      };
    }

    init() {
      // 테마 변경에 대비한 동적 색상 업데이트
      this.updateThemeColors();

      // 시계 작동
      this.startClock();
      
      // 캔버스 사이즈 및 이벤트 초기화
      this.setupCanvas();
      this.initCanvasEvents();
      
      // 글로벌 창 크기 조절 시 대응
      window.addEventListener('resize', () => {
        this.setupCanvas();
        this.renderLiveChart();
      });
      
      // 데이터 수신 이벤트 리스너 연결
      window.addEventListener('trendMicroUpdate', (e) => this.handleMicroUpdate(e.detail));
      window.addEventListener('trendRankUpdate', (e) => this.handleRankUpdate(e.detail));
      window.addEventListener('trendCategoryChange', (e) => this.handleCategoryChange(e.detail));
      window.addEventListener('trendSpikeDetected', (e) => this.handleSpikeAlert(e.detail));
    }

    startClock() {
      const updateClock = () => {
        const now = new Date();
        this.liveClock.textContent = now.toLocaleTimeString('ko-KR', { hour12: false });
      };
      updateClock();
      setInterval(updateClock, 1000);
    }

    // 트래픽 정밀 국문 변환 유틸
    formatTraffic(val) {
      if (!val) return '집계 중';
      if (val >= 10000) {
        const man = val / 10000;
        return `${man.toLocaleString('ko-KR')}만+ 검색`;
      }
      return `${val.toLocaleString('ko-KR')}+ 검색`;
    }

    // --- 1. 순위 리스트 렌더링 ---
    renderRankings(rankings) {
      const prevItemsMap = new Map();
      this.rankingsList.querySelectorAll('.rank-item').forEach(item => {
        const id = item.dataset.keywordId;
        prevItemsMap.set(id, {
          approxTraffic: parseInt(item.dataset.approxTraffic) || 0
        });
      });

      this.rankingsList.innerHTML = '';
      
      if (rankings.length === 0) {
        this.rankingsList.innerHTML = '<div style="text-align: center; color: var(--text-muted); margin-top: 100px;">트렌드 데이터를 수집 중입니다...</div>';
        return;
      }

      // 최초 렌더링 시 디폴트 타겟 지정
      if (!this.selectedKeywordId || !global.TrendEngine.getKeywordDetails(this.selectedKeywordId)) {
        this.selectedKeywordId = rankings[0].id;
        this.mapTargetKeyword.textContent = rankings[0].name;
        this.triggerMapRebuild(rankings[0]);
      }

      rankings.forEach((kw, idx) => {
        const item = document.createElement('div');
        item.className = `rank-item ${kw.id === this.selectedKeywordId ? 'active' : ''}`;
        item.dataset.keywordId = kw.id;
        item.dataset.rank = idx + 1;
        item.dataset.approxTraffic = kw.approxTraffic;

        // 순위 변동 아이콘
        let changeHtml = '';
        let changeClass = '';
        const rankDiff = kw.prevRank - kw.rank;

        if (kw.prevRank === 0) {
          changeHtml = 'NEW';
          changeClass = 'change-new';
        } else if (rankDiff > 0) {
          changeHtml = `▲ ${rankDiff}`;
          changeClass = 'change-up';
        } else if (rankDiff < 0) {
          changeHtml = `▼ ${Math.abs(rankDiff)}`;
          changeClass = 'change-down';
        } else {
          changeHtml = '-';
          changeClass = 'change-same';
        }

        // 마이크로 변화 감지 깜빡임
        const prevInfo = prevItemsMap.get(kw.id);
        if (prevInfo) {
          if (kw.approxTraffic > prevInfo.approxTraffic) {
            item.classList.add('flash-up');
            setTimeout(() => item.classList.remove('flash-up'), 600);
          } else if (kw.approxTraffic < prevInfo.approxTraffic) {
            item.classList.add('flash-down');
            setTimeout(() => item.classList.remove('flash-down'), 600);
          }
        }

        const categoryMap = { search: '검색', social: '소셜', shopping: '쇼핑', content: '미디어' };
        const sentimentMapKo = { positive: '🟢 긍정', neutral: '🟡 중립', negative: '🔴 우려' };

        item.innerHTML = `
          <div class="rank-number">${idx + 1}</div>
          <div class="rank-keyword">${kw.name}</div>
          <span class="category-badge badge-${kw.category}">${categoryMap[kw.category]}</span>
          <div class="rank-sentiment-group">
            <span class="sentiment-badge badge-sent-${kw.sentimentStatus}">${sentimentMapKo[kw.sentimentStatus] || '중립'}</span>
            <span class="trend-change ${changeClass}">${changeHtml}</span>
          </div>
        `;

        item.addEventListener('click', () => {
          this.selectKeyword(kw.id);
        });

        this.rankingsList.appendChild(item);
      });

      // 최상단 오프라인 인디케이터 표시
      if (global.TrendEngine.isOffline) {
        this.rankTimeIndicator.textContent = '로컬 백업 모드';
        this.rankTimeIndicator.style.color = 'var(--neon-pink)';
      } else {
        this.rankTimeIndicator.textContent = '실시간 API 동기화';
        this.rankTimeIndicator.style.color = 'var(--neon-blue)';
      }
    }

    selectKeyword(id) {
      this.selectedKeywordId = id;
      const newItem = this.rankingsList.querySelector(`.rank-item[data-keyword-id="${id}"]`);
      if (newItem) newItem.classList.add('active');

      const kw = global.TrendEngine.getKeywordDetails(id);
      if (kw) {
        this.chartFocusKeyword.textContent = kw.name;
        this.mapTargetKeyword.textContent = kw.name;
        this.renderLiveChart();
        this.triggerMapRebuild(kw);
        
        // 키워드 상세 댓글 드로어 열기 및 갱신
        this.openCommentDrawer(kw.name);
      }
    }

    // --- 2. AI 브리핑 및 실시간 감성 데이터 렌더링 ---
    renderLiveChart() {
      const selectedKw = global.TrendEngine.getKeywordDetails(this.selectedKeywordId);
      if (!selectedKw) return;

      if (this.chartFocusKeyword) {
        this.chartFocusKeyword.textContent = selectedKw.name;
      }

      // API 호출 또는 로컬 폴백을 통한 AI 브리핑 및 감성 데이터 확보
      if (global.TrendEngine.isOffline) {
        const briefData = global.TrendEngine.getLocalBriefing(selectedKw.name, selectedKw.related);
        this.updateBriefingUI(briefData);
      } else {
        fetch(`/api/briefing?keyword=${encodeURIComponent(selectedKw.name)}`)
          .then(res => {
            if (!res.ok) throw new Error('Briefing API error');
            return res.json();
          })
          .then(data => {
            this.updateBriefingUI(data);
          })
          .catch(err => {
            console.warn('Briefing API 로드 실패, 로컬 폴백을 사용합니다.', err);
            const briefData = global.TrendEngine.getLocalBriefing(selectedKw.name, selectedKw.related);
            this.updateBriefingUI(briefData);
          });
      }
    }

    updateBriefingUI(data) {
      if (!data) return;

      // 1. AI 요약 브리핑 텍스트 렌더링 (마크다운 ** 강조 변환)
      const briefingTextEl = document.getElementById('ai-briefing-text');
      if (briefingTextEl) {
        let html = data.summary || '';
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        briefingTextEl.innerHTML = html;
      }

      // 2. 소셜 감성 바 업데이트
      const posBar = document.getElementById('sentiment-pos');
      const neuBar = document.getElementById('sentiment-neu');
      const negBar = document.getElementById('sentiment-neg');
      
      const posVal = document.getElementById('val-sent-pos');
      const neuVal = document.getElementById('val-sent-neu');
      const negVal = document.getElementById('val-sent-neg');

      if (data.sentiment) {
        const pos = data.sentiment.positive || 0;
        const neu = data.sentiment.neutral || 0;
        const neg = data.sentiment.negative || 0;

        if (posBar) posBar.style.width = `${pos}%`;
        if (neuBar) neuBar.style.width = `${neu}%`;
        if (negBar) negBar.style.width = `${neg}%`;

        if (posVal) posVal.textContent = `${pos}%`;
        if (neuVal) neuVal.textContent = `${neu}%`;
        if (negVal) negVal.textContent = `${neg}%`;
      }

      // 3. 소셜 채널 게이지바 업데이트
      const chBars = {
        search: document.getElementById('bar-ch-search'),
        social: document.getElementById('bar-ch-social'),
        shopping: document.getElementById('bar-ch-shopping'),
        media: document.getElementById('bar-ch-media')
      };
      
      const chVals = {
        search: document.getElementById('val-ch-search'),
        social: document.getElementById('val-ch-social'),
        shopping: document.getElementById('val-ch-shopping'),
        media: document.getElementById('val-ch-media')
      };

      if (data.channels) {
        for (const ch in chBars) {
          const val = data.channels[ch] || 0;
          if (chBars[ch]) chBars[ch].style.width = `${val}%`;
          if (chVals[ch]) chVals[ch].textContent = `${val}%`;
        }
      }

      // 4. 감성 태그 클라우드 업데이트
      const tagsListEl = document.getElementById('emotion-tags-list');
      if (tagsListEl && data.emotionTags) {
        tagsListEl.innerHTML = '';
        data.emotionTags.forEach(tag => {
          const badge = document.createElement('span');
          badge.className = `emotion-tag-badge tag-sent-${data.status}`;
          badge.textContent = `#${tag}`;
          tagsListEl.appendChild(badge);
        });
      }
    }

    // --- 3. 실시간 네이버 뉴스 피드 스트리밍 렌더링 ---
    renderBuzzFeed(rankings) {
      if (this.buzzContainer.children.length > 0 && this.buzzContainer.querySelector('div[style*="text-align"]')) {
        this.buzzContainer.innerHTML = '';
      }

      // API를 통해 받아온 실제 뉴스 리스트가 있는 경우 연동
      const newsFeeds = global.TrendEngine.newsFeeds;
      
      let item = document.createElement('div');
      item.className = 'buzz-item';
      
      const now = new Date();
      const timeStr = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      if (newsFeeds && newsFeeds.length > 0) {
        // 중복 노출을 피하기 위해 임의의 실시간 뉴스 추출
        // 피드가 쌓일 때마다 새로운 실제 기사를 큐에서 인출
        const newsIdx = Math.floor(Math.random() * newsFeeds.length);
        const news = newsFeeds[newsIdx];
        
        // 이 뉴스가 대시보드 순위 내 키워드와 연계되어 있는지 분석해서 어울리는 컬러 매핑
        const matchedKw = rankings.find(r => news.title.includes(r.name) || r.name.split(' ').some(w => news.title.includes(w)));
        const color = matchedKw ? this.categoryColors[matchedKw.category] : 'var(--neon-purple)';
        const badgeLabel = matchedKw ? `${matchedKw.name} 연계` : '속보';

        item.style.borderLeftColor = color;
        item.style.cursor = 'pointer';
        
        // 클릭 시 해당 실제 기사 페이지로 새 창 이동
        item.addEventListener('click', () => {
          window.open(news.link, '_blank');
        });

        item.innerHTML = `
          <div class="buzz-meta">
            <span class="buzz-keyword-badge" style="color: ${color}">${badgeLabel} (${news.source})</span>
            <span>${news.timestamp || timeStr}</span>
          </div>
          <div class="buzz-content" style="text-decoration: underline; text-underline-offset: 3px;">"${news.title}"</div>
        `;
      } else {
        // API 뉴스 피드가 실패하거나 아직 없을 때 로컬 fallback
        if (rankings.length === 0) return;
        const kw = rankings[Math.floor(Math.random() * rankings.length)];
        
        const fallbackMsgs = [
          `"[공식 속보] '${kw.name}' 온라인 관심 급상승... 대중적 바이럴 추세 돌입"`,
          `"[보고서] 트렌드 지표상 '${kw.name}' 키워드가 오늘의 핫이슈 상위권에 랭크되었습니다."`,
          `"[소셜 뉴스] SNS 채널 내 '${kw.name}'에 관한 다각도의 여론이 교차 형성 중입니다."`
        ];
        
        const randomMsg = fallbackMsgs[Math.floor(Math.random() * fallbackMsgs.length)];
        item.style.borderLeftColor = this.categoryColors[kw.category];
        item.innerHTML = `
          <div class="buzz-meta">
            <span class="buzz-keyword-badge" style="color: ${this.categoryColors[kw.category]}">${kw.name} (종합)</span>
            <span>${timeStr}</span>
          </div>
          <div class="buzz-content">${randomMsg}</div>
        `;
      }

      this.buzzContainer.insertBefore(item, this.buzzContainer.firstChild);

      if (this.buzzContainer.children.length > 8) {
        const last = this.buzzContainer.lastChild;
        last.style.transition = 'opacity 0.4s';
        last.style.opacity = '0';
        setTimeout(() => {
          if (last.parentNode === this.buzzContainer) {
            this.buzzContainer.removeChild(last);
          }
        }, 400);
      }
    }

    // --- 4. 인터랙티브 연관어 맵 (Canvas Physics Simulator) ---
    setupCanvas() {
      const container = this.canvas.parentNode;
      const width = container.clientWidth;
      const height = container.clientHeight || 280;
      
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = width * dpr;
      this.canvas.height = height * dpr;
      
      this.canvas.style.width = width + 'px';
      this.canvas.style.height = height + 'px';
      
      this.ctx.resetTransform();
      this.ctx.scale(dpr, dpr);
    }

    initCanvasEvents() {
      this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
      this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
      this.canvas.addEventListener('mouseup', () => this.handleMouseUp());
      this.canvas.addEventListener('mouseleave', () => this.handleMouseUp());
      
      // 모바일 터치 이벤트 바인딩 (노드 드래그 시 스크롤 간섭 방지 처리 포함)
      this.canvas.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        if (!touch) return;
        const rect = this.canvas.getBoundingClientRect();
        const mx = touch.clientX - rect.left;
        const my = touch.clientY - rect.top;
        
        this.mouse.x = mx;
        this.mouse.y = my;
        this.mouse.isDown = true;

        this.draggedNode = null;
        for (let i = this.nodes.length - 1; i >= 0; i--) {
          const node = this.nodes[i];
          const dx = node.x - mx;
          const dy = node.y - my;
          if (Math.hypot(dx, dy) < node.radius) {
            this.draggedNode = node;
            e.preventDefault(); // 노드를 선택한 경우에만 화면 스크롤 기본 동작 차단
            break;
          }
        }
      }, { passive: false });

      this.canvas.addEventListener('touchmove', (e) => {
        if (!this.draggedNode || !this.mouse.isDown) return;
        const touch = e.touches[0];
        if (!touch) return;
        
        e.preventDefault(); // 노드 드래그 중에는 스크롤 차단
        
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = touch.clientX - rect.left;
        this.mouse.y = touch.clientY - rect.top;
      }, { passive: false });

      this.canvas.addEventListener('touchend', () => this.handleMouseUp());
      this.canvas.addEventListener('touchcancel', () => this.handleMouseUp());
      
      if (!this.physicsStarted) {
        this.physicsStarted = true;
        this.runPhysicsLoop();
      }
    }

    triggerMapRebuild(kw) {
      const cx = this.canvas.clientWidth / 2;
      const cy = (this.canvas.clientHeight || 280) / 2;
      
      this.nodes = [];
      this.links = [];

      const centerNode = {
        id: kw.id,
        label: kw.name,
        x: cx,
        y: cy,
        vx: 0,
        vy: 0,
        radius: 38,
        color: this.categoryColors[kw.category],
        isTarget: true,
        baseKwId: kw.id
      };
      this.nodes.push(centerNode);

      // 네이버 트렌드 연관 단어 렌더링
      kw.related.forEach((term, idx) => {
        const angle = (idx / kw.related.length) * Math.PI * 2;
        const dist = 90 + Math.random() * 25;
        
        const node = {
          id: `related-${idx}`,
          label: term,
          x: cx + Math.cos(angle) * 30,
          y: cy + Math.sin(angle) * 30,
          vx: Math.cos(angle) * 4.5,
          vy: Math.sin(angle) * 4.5,
          radius: 25,
          color: 'rgba(255, 255, 255, 0.08)',
          isTarget: false
        };
        
        this.nodes.push(node);
        this.links.push({
          source: centerNode,
          target: node,
          length: dist
        });
      });
    }

    handleMouseDown(e) {
      const rect = this.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      
      this.mouse.x = mx;
      this.mouse.y = my;
      this.mouse.isDown = true;

      this.draggedNode = null;
      for (let i = this.nodes.length - 1; i >= 0; i--) {
        const node = this.nodes[i];
        const dx = node.x - mx;
        const dy = node.y - my;
        if (Math.sqrt(dx * dx + dy * dy) < node.radius) {
          this.draggedNode = node;
          break;
        }
      }
    }

    handleMouseMove(e) {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - rect.left;
      this.mouse.y = e.clientY - rect.top;
    }

    handleMouseUp() {
      // 연관 노드를 드래그 없이 가볍게 클릭한 경우 처리
      if (this.draggedNode && !this.draggedNode.isTarget && this.mouse.isDown) {
        const dist = Math.hypot(this.draggedNode.x - this.mouse.x, this.draggedNode.y - this.mouse.y);
        
        if (dist < 5) {
          const clickedLabel = this.draggedNode.label;
          // 대시보드 리스트에 있는 키워드인지 확인 후 있으면 포커스 이동, 없으면 포털 검색 연동
          const match = global.TrendEngine.keywords.find(k => 
            k.name.includes(clickedLabel) || clickedLabel.includes(k.name)
          );
          
          if (match) {
            this.selectKeyword(match.id);
          } else {
            // 진짜 네이버 검색창을 새 탭으로 띄워 사용자 피드백 연계
            const searchUrl = `https://search.naver.com/search.naver?query=${encodeURIComponent(clickedLabel)}`;
            window.open(searchUrl, '_blank');
            
            this.showToastAlert({
              category: 'search',
              customMsg: `'${clickedLabel}' 관련 실제 포털 검색 결과를 새 탭으로 확인합니다.`
            });
          }
        }
      }
      
      this.draggedNode = null;
      this.mouse.isDown = false;
    }

    runPhysicsLoop() {
      const step = () => {
        this.updatePhysics();
        this.drawNetworkMap();
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }

    updatePhysics() {
      const width = this.canvas.clientWidth;
      const height = this.canvas.clientHeight || 280;
      const cx = width / 2;
      const cy = height / 2;

      if (this.draggedNode && this.mouse.isDown) {
        this.draggedNode.x = this.mouse.x;
        this.draggedNode.y = this.mouse.y;
        this.draggedNode.vx = 0;
        this.draggedNode.vy = 0;
      }

      // 1. 척력
      for (let i = 0; i < this.nodes.length; i++) {
        const n1 = this.nodes[i];
        for (let j = i + 1; j < this.nodes.length; j++) {
          const n2 = this.nodes[j];
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDist = n1.radius + n2.radius + 20;

          if (dist < minDist) {
            const force = (minDist - dist) * 0.05;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            
            if (n1 !== this.draggedNode) { n1.x -= fx; n1.y -= fy; }
            if (n2 !== this.draggedNode) { n2.x += fx; n2.y += fy; }
          }
        }
      }

      // 2. 인력 (스프링)
      this.links.forEach(link => {
        const n1 = link.source;
        const n2 = link.target;
        const dx = n2.x - n1.x;
        const dy = n2.y - n1.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const diff = dist - link.length;
        
        const k = 0.025;
        const fx = (dx / dist) * diff * k;
        const fy = (dy / dist) * diff * k;

        if (n1 !== this.draggedNode) { n1.vx += fx; n1.vy += fy; }
        if (n2 !== this.draggedNode) { n2.vx -= fx; n2.vy -= fy; }
      });

      // 3. 센터 그래비티
      const centerNode = this.nodes.find(n => n.isTarget);
      if (centerNode && centerNode !== this.draggedNode) {
        const dx = cx - centerNode.x;
        const dy = cy - centerNode.y;
        centerNode.vx += dx * 0.015;
        centerNode.vy += dy * 0.015;
      }

      this.nodes.forEach(node => {
        if (node === this.draggedNode) return;
        node.vx *= 0.82;
        node.vy *= 0.82;
        node.x += node.vx;
        node.y += node.vy;

        node.x = Math.max(node.radius, Math.min(width - node.radius, node.x));
        node.y = Math.max(node.radius, Math.min(height - node.radius, node.y));
      });
    }

    drawNetworkMap() {
      const width = this.canvas.clientWidth;
      const height = this.canvas.clientHeight || 280;
      this.ctx.clearRect(0, 0, width, height);

      const isLight = document.documentElement.getAttribute('data-theme') === 'light';

      // 선 그리기
      this.links.forEach(link => {
        this.ctx.beginPath();
        this.ctx.moveTo(link.source.x, link.source.y);
        this.ctx.lineTo(link.target.x, link.target.y);
        
        const grad = this.ctx.createLinearGradient(link.source.x, link.source.y, link.target.x, link.target.y);
        grad.addColorStop(0, link.source.color);
        grad.addColorStop(1, isLight ? 'rgba(15, 23, 42, 0.05)' : 'rgba(255, 255, 255, 0.05)');
        
        this.ctx.strokeStyle = grad;
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();
      });

      // 노드 그리기
      this.nodes.forEach(node => {
        this.ctx.beginPath();
        this.ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        
        if (node.isTarget) {
          this.ctx.fillStyle = node.color;
          this.ctx.shadowBlur = 12;
          this.ctx.shadowColor = node.color;
        } else {
          this.ctx.fillStyle = isLight ? '#ffffff' : 'rgba(22, 30, 52, 0.8)';
          this.ctx.strokeStyle = isLight ? 'rgba(15, 23, 42, 0.12)' : 'rgba(255, 255, 255, 0.15)';
          this.ctx.lineWidth = 1;
          this.ctx.shadowBlur = 0;
        }
        
        this.ctx.fill();
        if (!node.isTarget) this.ctx.stroke();
        
        this.ctx.shadowBlur = 0;
        this.ctx.fillStyle = node.isTarget ? '#ffffff' : (isLight ? '#0f172a' : '#ffffff');
        this.ctx.font = node.isTarget ? 'bold 11px var(--font-family)' : '10px var(--font-family)';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        // 라벨 문자열 나누어 드로잉
        const text = node.label;
        if (text.length > 6 && !node.isTarget) {
          const half = Math.ceil(text.length / 2);
          this.ctx.fillText(text.substr(0, half), node.x, node.y - 6);
          this.ctx.fillText(text.substr(half), node.x, node.y + 6);
        } else {
          this.ctx.fillText(text, node.x, node.y);
        }
      });
    }

    // --- 5. 실시간 알림 피드 및 요약 지표 ---
    renderAlertsFeed() {
      const alerts = global.TrendEngine.alerts;
      if (alerts.length === 0) {
        this.alertsList.innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 12px; padding: 20px;">특이 현상이 발견되지 않았습니다.</div>';
        return;
      }

      this.alertsList.innerHTML = '';
      alerts.slice(0, 6).forEach(alert => {
        const card = document.createElement('div');
        card.className = `alert-card ${alert.read ? 'read' : ''}`;
        
        const categoryIconMap = { search: '⚡', social: '🔥', shopping: '🛒', content: '🎬' };

        card.innerHTML = `
          <div class="alert-icon">${categoryIconMap[alert.category]}</div>
          <div class="alert-info">
            <div class="alert-msg"><strong>${alert.keywordName}</strong> 실시간 버즈 급증 (+${alert.percent}%)</div>
            <div class="alert-time">${alert.timestamp}</div>
          </div>
        `;

        card.addEventListener('click', () => {
          card.classList.add('read');
          alert.read = true;
          this.selectKeyword(alert.keywordId);
        });

        this.alertsList.appendChild(card);
      });
    }

    renderSummaryStats() {
      const stats = global.TrendEngine.generateReportData();
      
      if (this.statTopKeyword) this.statTopKeyword.textContent = stats.topKeyword;
      if (this.statAvgPosRate) this.statAvgPosRate.textContent = `${stats.sentimentPositiveRate}%`;
      if (this.statHotChannel) this.statHotChannel.textContent = stats.hottestChannel;
      
      // 카테고리 도넛 차트 업데이트 실행
      this.renderCategoryDonutChart();
    }

    renderCategoryDonutChart() {
      if (!this.donutChartSvg || !global.TrendEngine || !global.TrendEngine.keywords) return;
      
      const keywords = global.TrendEngine.keywords;
      const total = keywords.length;
      
      if (total === 0) {
        this.donutTotalCount.textContent = '0';
        this.donutChartSvg.innerHTML = '';
        this.donutLegend.innerHTML = '<div style="grid-column: span 2; text-align: center; color: var(--text-muted);">데이터 없음</div>';
        return;
      }
      
      const counts = { search: 0, social: 0, shopping: 0, content: 0 };
      keywords.forEach(kw => {
        if (counts[kw.category] !== undefined) {
          counts[kw.category]++;
        }
      });
      
      this.donutTotalCount.textContent = total;
      
      // cx=21, cy=21, r=15.91549430918954 (circumference = 100)
      let currentOffset = 0;
      let svgHtml = '';
      
      const categoriesOrder = ['search', 'social', 'shopping', 'content'];
      const categoryLabelsKo = {
        search: '검색 트렌드',
        social: '소셜 버즈',
        shopping: '쇼핑/소비',
        content: '미디어/콘텐츠'
      };
      
      let legendHtml = '';
      
      categoriesOrder.forEach(cat => {
        const count = counts[cat];
        const percentage = total > 0 ? (count / total) * 100 : 0;
        
        if (percentage > 0) {
          const dashArray = `${percentage} ${100 - percentage}`;
          const dashOffset = 100 - currentOffset;
          
          svgHtml += `
            <circle class="donut-slice" cx="21" cy="21" r="15.91549430918954" 
                    fill="transparent" 
                    stroke="${this.categoryColors[cat]}" 
                    stroke-width="3.2" 
                    stroke-dasharray="${dashArray}" 
                    stroke-dashoffset="${dashOffset}"
                    data-category="${cat}"
                    style="color: ${this.categoryColors[cat]};">
              <title>${categoryLabelsKo[cat]}: ${count}개 (${Math.round(percentage)}%)</title>
            </circle>
          `;
          
          currentOffset += percentage;
        }
        
        legendHtml += `
          <div class="legend-item" data-category="${cat}" style="border: 1px solid transparent;">
            <span class="legend-color" style="background-color: ${this.categoryColors[cat]}; color: ${this.categoryColors[cat]}; box-shadow: 0 0 6px ${this.categoryColors[cat]};"></span>
            <span class="legend-label">${categoryLabelsKo[cat]}</span>
            <span class="legend-value">${count}</span>
          </div>
        `;
      });
      
      this.donutChartSvg.innerHTML = svgHtml;
      this.donutLegend.innerHTML = legendHtml;
      
      this.setupDonutInteractions();
    }

    setupDonutInteractions() {
      const slices = this.donutChartSvg.querySelectorAll('.donut-slice');
      const legendItems = this.donutLegend.querySelectorAll('.legend-item');
      
      const highlight = (cat) => {
        slices.forEach(slice => {
          if (slice.dataset.category === cat) {
            slice.style.strokeWidth = '4.5';
            slice.style.filter = `drop-shadow(0 0 4px ${this.categoryColors[cat]})`;
          } else {
            slice.style.opacity = '0.3';
          }
        });
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        legendItems.forEach(item => {
          if (item.dataset.category === cat) {
            item.style.background = isLight ? 'rgba(15, 23, 42, 0.04)' : 'rgba(255, 255, 255, 0.05)';
            item.style.borderColor = isLight ? 'rgba(15, 23, 42, 0.08)' : 'rgba(255, 255, 255, 0.08)';
          } else {
            item.style.opacity = '0.4';
          }
        });
      };
      
      const reset = () => {
        slices.forEach(slice => {
          slice.style.strokeWidth = '3.2';
          slice.style.filter = 'none';
          slice.style.opacity = '1';
        });
        legendItems.forEach(item => {
          item.style.background = 'transparent';
          item.style.borderColor = 'transparent';
          item.style.opacity = '1';
        });
      };
      
      slices.forEach(slice => {
        slice.addEventListener('mouseenter', () => highlight(slice.dataset.category));
        slice.addEventListener('mouseleave', reset);
      });
      
      legendItems.forEach(item => {
        item.addEventListener('mouseenter', () => highlight(item.dataset.category));
        item.addEventListener('mouseleave', reset);
        
        item.addEventListener('click', () => {
          const cat = item.dataset.category;
          // 카테고리 필터링 토글 실행
          const targetCategory = global.TrendEngine.currentCategory === cat ? 'all' : cat;
          global.TrendEngine.setCategory(targetCategory);
        });
      });
    }

    // --- 6. 토스트 급상승 팝업 알림 ---
    handleSpikeAlert(alert) {
      if (document.hidden) return;

      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.style.borderLeftColor = this.categoryColors[alert.category];
      toast.style.boxShadow = `0 10px 25px rgba(0,0,0,0.5), 0 0 10px ${this.categoryColors[alert.category]}40`;

      const categoryMap = { search: '포털 실시간 검색', social: '소셜 바이럴 언급', shopping: '이커머스 거래도', content: '미디어 조회 반응' };

      toast.innerHTML = `
        <div class="toast-body">
          <h4 style="color: ${this.categoryColors[alert.category]}">🚨 실시간 트렌드 폭발!</h4>
          <p><strong>${alert.keywordName}</strong>에 대한 ${categoryMap[alert.category]} 수치가 <strong>${alert.percent}%</strong> 급상승 감지!</p>
        </div>
      `;

      toast.addEventListener('click', () => {
        this.selectKeyword(alert.keywordId);
        toast.style.animation = 'toast-out 0.2s forwards';
        setTimeout(() => toast.remove(), 200);
      });

      this.toastContainer.appendChild(toast);

      setTimeout(() => {
        if (toast.parentNode === this.toastContainer) {
          toast.remove();
        }
      }, 5000);
    }

    showToastAlert(customAlert) {
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.style.borderLeftColor = this.categoryColors[customAlert.category];
      
      toast.innerHTML = `
        <div class="toast-body">
          <h4 style="color: ${this.categoryColors[customAlert.category]}">🌐 트렌드 리디렉션</h4>
          <p>${customAlert.customMsg}</p>
        </div>
      `;
      this.toastContainer.appendChild(toast);
      setTimeout(() => toast.remove(), 4000);
    }

    // --- 7. 리포트 모달 오픈 및 렌더링 ---
    openReportModal() {
      const stats = global.TrendEngine.generateReportData();
      
      this.reportModalBody.innerHTML = `
        <div class="report-summary-box">
          <h3>AI 실시간 트렌드 보고서</h3>
          <p>현 시각 국내 트렌드 감지 결과 대중의 최선호 토픽은 <strong>"${stats.topKeyword}"</strong>입니다. 
          최근에는 <strong>"${stats.topCategory}"</strong> 관련 온라인 활동이 두드러지고 있으며, 
          대중 평균 긍정 여론은 <strong>${stats.sentimentPositiveRate}%</strong>로 평가됩니다. 
          가장 대화가 뜨거운 최대 버즈 채널은 <strong>${stats.hottestChannel}</strong>로 나타났습니다.</p>
        </div>

        <div class="report-grid">
          <div class="report-card-mini">
            <h4>종합 대중 긍정률</h4>
            <div class="value" style="color: var(--neon-green);">${stats.sentimentPositiveRate}%</div>
          </div>
          <div class="report-card-mini">
            <h4>최대 소셜 채널</h4>
            <div class="value" style="color: var(--neon-blue);">${stats.hottestChannel}</div>
          </div>
        </div>

        <div>
          <h3 class="panel-section-title" style="font-size: 14px; margin-bottom: 10px;">카테고리별 실시간 TOP</h3>
          <div class="report-top-list">
            <div class="report-top-item">
              <span>🌐 검색 트렌드</span>
              <strong style="color: var(--neon-blue);">${stats.categoryBest.search || '데이터 로드 중'}</strong>
            </div>
            <div class="report-top-item">
              <span>💬 소셜 버즈</span>
              <strong style="color: var(--neon-pink);">${stats.categoryBest.social || '데이터 로드 중'}</strong>
            </div>
            <div class="report-top-item">
              <span>🛒 쇼핑/소비</span>
              <strong style="color: var(--neon-green);">${stats.categoryBest.shopping || '데이터 로드 중'}</strong>
            </div>
            <div class="report-top-item">
              <span>🎬 미디어/콘텐츠</span>
              <strong style="color: var(--neon-orange);">${stats.categoryBest.content || '데이터 로드 중'}</strong>
            </div>
          </div>
        </div>

        <div>
          <h3 class="panel-section-title" style="font-size: 14px; margin-bottom: 10px;">종합 트래픽 TOP 3</h3>
          <div class="report-top-list">
            ${stats.top3Keywords.map(k => `
              <div class="report-top-item">
                <span><strong>${k.rank}위</strong> ${k.name} (${k.category})</span>
                <span style="font-family: monospace;">${this.formatTraffic(k.approxTraffic)}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      
      this.reportModal.showModal();
    }

    // --- 이벤트 핸들러 ---
    handleMicroUpdate(rankings) {
      if (this.isCommentInputFocused) return;
      
      this.renderRankings(rankings);
      this.renderLiveChart();
      this.renderSummaryStats();
      
      // 마이크로 주기마다 35% 확률로 뉴스 피드 스트리밍 틱
      if (Math.random() < 0.35) {
        this.renderBuzzFeed(rankings);
      }
    }

    handleRankUpdate(data) {
      if (this.isCommentInputFocused) return;
      
      this.renderRankings(data.rankings);
      this.renderLiveChart();
      this.renderAlertsFeed();
      this.renderSummaryStats();
      
      // 주기적 갱신 시에는 무조건 기사 스트리밍 추가
      this.renderBuzzFeed(data.rankings);
    }

    getCategoryText(category, period) {
      const periodLabels = {
        today: { prefix: '오늘의 ', descSuffix: '오늘 하루 동안의' },
        week: { prefix: '주간 ', descSuffix: '최근 1주일간의' },
        month: { prefix: '월간 ', descSuffix: '최근 1개월간의' },
        year: { prefix: '연간 ', descSuffix: '최근 1년간의' }
      };
      
      const p = periodLabels[period] || periodLabels.today;
      
      const titles = {
        all: `${p.prefix}종합 트렌드`,
        search: `${p.prefix}검색 트렌드`,
        social: `${p.prefix}소셜 버즈`,
        shopping: `${p.prefix}쇼핑/소비 트렌드`,
        content: `${p.prefix}미디어/콘텐츠 트렌드`
      };
      
      const descs = {
        all: `네이버 인기 검색어 및 주요 이슈 데이터를 종합 분석하여 ${p.descSuffix} 트렌드를 모니터링합니다.`,
        search: `국내 포털 및 네이버 인기 검색 키워드를 분석하여 ${p.descSuffix} 검색 순위를 제공합니다.`,
        social: `주요 소셜 미디어 플랫폼과 커뮤니티의 언급량을 분석하여 ${p.descSuffix} 화제성을 감지합니다.`,
        shopping: `급부상하는 구매 아이템 및 기획전 데이터를 분석하여 ${p.descSuffix} 소비 성향을 반영합니다.`,
        content: `실시간 동영상 인기 순위 및 방송 동향을 분석하여 ${p.descSuffix} 미디어 인기도를 측정합니다.`
      };
      
      return {
        title: titles[category] || titles.all,
        desc: descs[category] || descs.all
      };
    }

    handleCategoryChange(rankings) {
      const cat = global.TrendEngine.currentCategory;
      const period = global.TrendEngine.currentPeriod;
      
      const textData = this.getCategoryText(cat, period);
      this.categoryTitle.textContent = textData.title;
      this.categoryDesc.textContent = textData.desc;
      
      const cardTitles = {
        today: { rankings: '오늘의 트렌드 순위 (TOP 10)', chart: 'AI 트렌드 요약 및 소셜 여론 분석' },
        week: { rankings: '주간 트렌드 순위 (TOP 10)', chart: 'AI 트렌드 요약 및 소셜 여론 분석' },
        month: { rankings: '월간 트렌드 순위 (TOP 10)', chart: 'AI 트렌드 요약 및 소셜 여론 분석' },
        year: { rankings: '연간 트렌드 순위 (TOP 10)', chart: 'AI 트렌드 요약 및 소셜 여론 분석' }
      };
      const ct = cardTitles[period] || cardTitles.today;
      
      if (this.rankingsCardTitle) {
        this.rankingsCardTitle.innerHTML = `
          <svg class="card-title-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 22 22 22"></polygon></svg>
          ${ct.rankings}
        `;
      }
      if (this.chartCardTitle) {
        this.chartCardTitle.innerHTML = `
          <svg class="card-title-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
          ${ct.chart}
        `;
      }
      
      this.renderRankings(rankings);
      
      if (rankings.length > 0) {
        this.selectKeyword(rankings[0].id);
      }
    }

    openCommentDrawer(keywordName) {
      if (!this.commentDrawer) return;

      this.drawerKeywordName.textContent = keywordName;
      this.commentDrawer.classList.add('open');

      // Autofill nickname from localStorage
      const authorInput = document.getElementById('comment-author');
      if (authorInput && !authorInput.value) {
        authorInput.value = localStorage.getItem('my_nickname') || '';
      }

      // 기존 폴링 정지 후 새 키워드 폴링 가동
      if (this.commentPollingInterval) {
        clearInterval(this.commentPollingInterval);
      }

      this.fetchComments(keywordName);
      
      this.commentPollingInterval = setInterval(() => {
        this.fetchComments(keywordName);
      }, 5000);
    }

    closeCommentDrawer() {
      if (!this.commentDrawer) return;
      this.commentDrawer.classList.remove('open');
      if (this.commentPollingInterval) {
        clearInterval(this.commentPollingInterval);
        this.commentPollingInterval = null;
      }
    }

    fetchComments(keywordName) {
      if (!this.drawerCommentsList) return;

      fetch(`/api/comments?keyword=${encodeURIComponent(keywordName)}`)
        .then(res => res.json())
        .then(comments => {
          this.drawerCommentsList.innerHTML = '';
          
          if (comments.length === 0) {
            this.drawerCommentsList.innerHTML = '<div style="text-align: center; color: var(--text-muted); margin-top: 100px; font-size: 13px;">이 키워드에 첫 톡을 달아 의견을 공유해보세요!</div>';
            return;
          }

          comments.forEach(comment => {
            const date = new Date(comment.timestamp);
            const timeStr = date.toLocaleDateString('ko-KR', {
              month: 'numeric',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            });

            const bubble = document.createElement('div');
            bubble.className = 'comment-bubble';
            bubble.innerHTML = `
              <div class="comment-meta">
                <span class="comment-author">${comment.author}</span>
                <button class="comment-delete-btn" data-comment-id="${comment.id}">&times;</button>
              </div>
              <div class="comment-text">${comment.content}</div>
              <span class="comment-time">${timeStr}</span>
            `;

            // 삭제 버튼 바인딩
            const deleteBtn = bubble.querySelector('.comment-delete-btn');
            deleteBtn.addEventListener('click', () => {
              this.deleteComment(comment.id, keywordName);
            });

            this.drawerCommentsList.appendChild(bubble);
          });
          
          // 항상 스크롤을 최하단으로 이동
          this.drawerCommentsList.scrollTop = this.drawerCommentsList.scrollHeight;
        })
        .catch(err => {
          console.error('댓글 로딩 실패:', err);
        });
    }

    deleteComment(commentId, keywordName) {
      const password = prompt('댓글 삭제를 위해 설정했던 비밀번호 4자리를 입력해주세요:');
      if (password === null) return; // 취소 클릭 시

      if (password.length !== 4) {
        alert('비밀번호는 4자리여야 합니다.');
        return;
      }

      fetch('/api/comments/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          comment_id: commentId,
          password: password
        })
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          this.fetchComments(keywordName);
          this.showToastAlert({
            category: 'content',
            customMsg: '댓글이 정상적으로 삭제되었습니다.'
          });
        } else {
          alert(data.error || '비밀번호가 일치하지 않습니다.');
        }
      })
      .catch(err => {
        console.error('댓글 삭제 에러:', err);
      });
    }

    openMyInfoModal() {
      if (!this.myInfoModal) return;

      const nickname = localStorage.getItem('my_nickname') || '-';
      let myComments = [];
      try {
        myComments = JSON.parse(localStorage.getItem('my_comments')) || [];
      } catch (e) {
        console.error('Failed to parse my_comments:', e);
      }

      if (this.myInfoNickname) {
        this.myInfoNickname.textContent = nickname;
      }
      if (this.myInfoCommentCount) {
        this.myInfoCommentCount.textContent = myComments.length;
      }

      this.renderMyComments(myComments);
      this.myInfoModal.showModal();
    }

    renderMyComments(myComments) {
      if (!this.myInfoCommentsList) return;

      this.myInfoCommentsList.innerHTML = '';

      if (myComments.length === 0) {
        this.myInfoCommentsList.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 30px; font-size: 13px;">아직 작성한 댓글이 없습니다.</div>';
        return;
      }

      // Sort comments by timestamp desc (newest first)
      const sortedComments = [...myComments].sort((a, b) => b.timestamp - a.timestamp);

      sortedComments.forEach(comment => {
        const date = new Date(comment.timestamp);
        const timeStr = date.toLocaleDateString('ko-KR', {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        });

        const item = document.createElement('div');
        item.className = 'my-comment-item';
        item.style.background = 'var(--card-item-bg)';
        item.style.border = '1px solid var(--panel-border)';
        item.style.borderRadius = '8px';
        item.style.padding = '12px';
        item.style.display = 'flex';
        item.style.flexDirection = 'column';
        item.style.gap = '6px';
        item.style.textAlign = 'left';

        item.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <a class="my-comment-keyword-link" style="font-size: 12px; color: var(--neon-purple); font-weight: 700; cursor: pointer; text-decoration: none;">#${comment.keyword}</a>
            <button class="my-comment-del-btn" style="background: none; border: 1px solid rgba(255, 75, 154, 0.25); color: var(--neon-pink); cursor: pointer; font-size: 11px; padding: 2px 8px; border-radius: 4px; transition: all 0.2s;">삭제</button>
          </div>
          <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.4; word-break: break-all;">${comment.content}</div>
          <div style="font-size: 10px; color: var(--text-muted); text-align: right;">${timeStr}</div>
        `;

        // Bind keyword link click
        const link = item.querySelector('.my-comment-keyword-link');
        link.addEventListener('click', (e) => {
          e.preventDefault();
          this.myInfoModal.close();
          // Find keyword in TrendEngine keywords
          const matchedKw = global.TrendEngine.keywords.find(k => k.name === comment.keyword);
          if (matchedKw) {
            this.selectKeyword(matchedKw.id);
          } else {
            // If not found in current rankings list, open drawer anyway using custom name
            this.openCommentDrawer(comment.keyword);
          }
        });

        // Bind direct delete click
        const delBtn = item.querySelector('.my-comment-del-btn');
        delBtn.addEventListener('click', () => {
          this.deleteMyComment(comment.id, comment.password, comment.keyword);
        });

        this.myInfoCommentsList.appendChild(item);
      });
    }

    deleteMyComment(commentId, password, keywordName) {
      if (!confirm('이 댓글을 삭제하시겠습니까?')) return;

      fetch('/api/comments/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          comment_id: commentId,
          password: password
        })
      })
      .then(res => res.json())
      .then(data => {
        if (data.success || data.error === '댓글을 찾을 수 없습니다.') {
          // Remove from localStorage
          let myComments = [];
          try {
            myComments = JSON.parse(localStorage.getItem('my_comments')) || [];
          } catch (e) {
            console.error('Failed to parse my_comments:', e);
          }
          myComments = myComments.filter(c => c.id !== commentId);
          localStorage.setItem('my_comments', JSON.stringify(myComments));

          // Update My Info display
          const nickname = localStorage.getItem('my_nickname') || '-';
          if (this.myInfoNickname) {
            this.myInfoNickname.textContent = nickname;
          }
          if (this.myInfoCommentCount) {
            this.myInfoCommentCount.textContent = myComments.length;
          }
          this.renderMyComments(myComments);

          // If current comment drawer is open for this keyword, fetch comments to update
          if (this.commentDrawer && this.commentDrawer.classList.contains('open') && this.drawerKeywordName.textContent === keywordName) {
            this.fetchComments(keywordName);
          }

          this.showToastAlert({
            category: 'content',
            customMsg: '댓글이 성공적으로 삭제되었습니다.'
          });
        } else {
          alert(data.error || '댓글 삭제에 실패했습니다.');
        }
      })
      .catch(err => {
        console.error('댓글 삭제 에러:', err);
      });
    }

    clearMyInfo() {
      if (!confirm('닉네임 정보와 내가 작성한 모든 댓글 내역을 초기화하시겠습니까? (서버의 댓글 자체는 삭제되지 않습니다.)')) return;

      localStorage.removeItem('my_comments');
      localStorage.removeItem('my_nickname');

      if (this.myInfoNickname) {
        this.myInfoNickname.textContent = '-';
      }
      if (this.myInfoCommentCount) {
        this.myInfoCommentCount.textContent = '0';
      }
      if (this.myInfoCommentsList) {
        this.myInfoCommentsList.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 30px; font-size: 13px;">아직 작성한 댓글이 없습니다.</div>';
      }

      this.showToastAlert({
        category: 'social',
        customMsg: '나의 정보가 성공적으로 초기화되었습니다.'
      });
    }
  }

  global.TrendUI = new TrendUI();

})(window);

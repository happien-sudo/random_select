/**
 * ==========================================================================
 * 교실 랜덤 학생 뽑기 - Main Application Logic
 * ==========================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
  // ------------------------------------------------------------------------
  // 상태(State) 정의
  // ------------------------------------------------------------------------
  const state = {
    waitingList: [],        // 현재 추첨 대기 중인 학생 목록
    initialList: [],        // 최초 등록된 전체 학생 목록 (복원용)
    pickedList: [],         // 이미 뽑힌 학생 목록 [{ name, order, time }]
    isDrawing: false,       // 현재 추첨 진행 중 여부
    soundEnabled: true,     // 효과음 활성화 여부
    fastMode: false,        // 애니메이션 단축 모드
    activeTab: 'edit',      // 'edit' | 'list'
  };

  // ------------------------------------------------------------------------
  // DOM 요소 참조
  // ------------------------------------------------------------------------
  const elements = {
    // 헤더
    soundToggleBtn: document.getElementById('soundToggleBtn'),
    soundIcon: document.getElementById('soundIcon'),
    fullscreenBtn: document.getElementById('fullscreenBtn'),
    resetAllBtn: document.getElementById('resetAllBtn'),
    
    // 왼쪽 패널
    editModeBtn: document.getElementById('editModeBtn'),
    listModeBtn: document.getElementById('listModeBtn'),
    editView: document.getElementById('editView'),
    listView: document.getElementById('listView'),
    nameInputArea: document.getElementById('nameInputArea'),
    applyNamesBtn: document.getElementById('applyNamesBtn'),
    sampleNamesBtn: document.getElementById('sampleNamesBtn'),
    clearNamesBtn: document.getElementById('clearNamesBtn'),
    shuffleBtn: document.getElementById('shuffleBtn'),
    studentChipContainer: document.getElementById('studentChipContainer'),
    waitingCountBadge: document.getElementById('waitingCountBadge'),
    totalCountText: document.getElementById('totalCountText'),
    remainingCountText: document.getElementById('remainingCountText'),

    // 오른쪽 스테이션
    stageStatusBadge: document.getElementById('stageStatusBadge'),
    displayBox: document.getElementById('displayBox'),
    rollerNames: document.getElementById('rollerNames'),
    winnerAnnouncement: document.getElementById('winnerAnnouncement'),
    drawBtn: document.getElementById('drawBtn'),
    fastModeCheckbox: document.getElementById('fastModeCheckbox'),

    // 하단 결과창
    pickedCountBadge: document.getElementById('pickedCountBadge'),
    historyListContainer: document.getElementById('historyListContainer'),
    copyResultBtn: document.getElementById('copyResultBtn'),
    resetOnlyPickedBtn: document.getElementById('resetOnlyPickedBtn'),

    // 토스트 및 캔버스
    toast: document.getElementById('toast'),
    confettiCanvas: document.getElementById('confettiCanvas'),
  };

  // ------------------------------------------------------------------------
  // 1. Web Audio API 기반 효과음 합성기 (외부 파일 불필요)
  // ------------------------------------------------------------------------
  let audioCtx = null;

  function initAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  // 롤링 시 경쾌한 틱 사운드
  function playTickSound(frequency = 600) {
    if (!state.soundEnabled || !audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.05);
    } catch (e) {
      console.warn('사운드 재생 에러:', e);
    }
  }

  // 당첨 확정 시 승리의 팡파레 사운드
  function playFanfareSound() {
    if (!state.soundEnabled || !audioCtx) return;
    try {
      const notes = [
        { freq: 523.25, time: 0.0, dur: 0.12 }, // C5
        { freq: 659.25, time: 0.12, dur: 0.12 }, // E5
        { freq: 783.99, time: 0.24, dur: 0.12 }, // G5
        { freq: 1046.50, time: 0.38, dur: 0.45 }, // C6 (길게)
      ];

      notes.forEach(n => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(n.freq, audioCtx.currentTime + n.time);
        gain.gain.setValueAtTime(0.18, audioCtx.currentTime + n.time);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + n.time + n.dur);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime + n.time);
        osc.stop(audioCtx.currentTime + n.time + n.dur);
      });
    } catch (e) {
      console.warn('사운드 재생 에러:', e);
    }
  }

  // 학생 명단 소진 시 알림음
  function playNoticeSound() {
    if (!state.soundEnabled || !audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.2);
    } catch (e) {
      console.warn('사운드 재생 에러:', e);
    }
  }

  // ------------------------------------------------------------------------
  // 2. 순수 Canvas 폭죽(Confetti) 파티클 시스템
  // ------------------------------------------------------------------------
  const confetti = {
    canvas: elements.confettiCanvas,
    ctx: elements.confettiCanvas.getContext('2d'),
    particles: [],
    animationId: null,

    resize() {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    },

    start() {
      this.resize();
      this.particles = [];
      const colors = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];
      
      // 80개의 색종이 조각 생성
      for (let i = 0; i < 90; i++) {
        this.particles.push({
          x: this.canvas.width * 0.5 + (Math.random() - 0.5) * 200,
          y: this.canvas.height * 0.45 + (Math.random() - 0.5) * 100,
          vx: (Math.random() - 0.5) * 24,
          vy: (Math.random() - 0.85) * 20 - 4,
          size: Math.random() * 9 + 6,
          color: colors[Math.floor(Math.random() * colors.length)],
          rotation: Math.random() * 360,
          rotSpeed: (Math.random() - 0.5) * 12,
          opacity: 1,
          decay: Math.random() * 0.015 + 0.01,
        });
      }

      if (this.animationId) cancelAnimationFrame(this.animationId);
      this.loop();
    },

    loop() {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      let aliveCount = 0;
      for (let p of this.particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.55; // 중력
        p.vx *= 0.98; // 공기 저항
        p.rotation += p.rotSpeed;
        p.opacity -= p.decay;

        if (p.opacity > 0) {
          aliveCount++;
          this.ctx.save();
          this.ctx.translate(p.x, p.y);
          this.ctx.rotate((p.rotation * Math.PI) / 180);
          this.ctx.globalAlpha = Math.max(0, p.opacity);
          this.ctx.fillStyle = p.color;
          this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
          this.ctx.restore();
        }
      }

      if (aliveCount > 0) {
        this.animationId = requestAnimationFrame(() => this.loop());
      } else {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.animationId = null;
      }
    }
  };

  window.addEventListener('resize', () => confetti.resize());

  // ------------------------------------------------------------------------
  // 3. UI 헬퍼 함수
  // ------------------------------------------------------------------------
  let toastTimer = null;
  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      elements.toast.classList.remove('show');
    }, 2400);
  }

  function formatCurrentTime() {
    const now = new Date();
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? '오후' : '오전';
    hours = hours % 12 || 12;
    return `${ampm} ${hours}:${minutes}`;
  }

  // ------------------------------------------------------------------------
  // 4. 명단 데이터 처리 & 로컬 저장소 동기화
  // ------------------------------------------------------------------------
  const STORAGE_KEY = 'classroom_random_selector_names';

  function saveToLocalStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.initialList));
    } catch (e) {
      console.warn('LocalStorage 저장 실패:', e);
    }
  }

  function loadFromLocalStorage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('LocalStorage 불러오기 실패:', e);
    }
    return null;
  }

  // 텍스트 파싱하여 학생 배열 생성
  function parseNamesFromText(text) {
    return text
      .split(/[\n,]+/)
      .map(item => item.trim())
      .filter(item => item.length > 0);
  }

  // 명단 적용 처리
  function applyNames(names, resetHistory = true) {
    if (!names || names.length === 0) {
      showToast('⚠️ 이름을 최소 1명 이상 입력해주세요!');
      return false;
    }

    state.initialList = [...names];
    state.waitingList = [...names];

    if (resetHistory) {
      state.pickedList = [];
    } else {
      // 이미 뽑힌 사람 제외
      const pickedNames = state.pickedList.map(p => p.name);
      state.waitingList = state.waitingList.filter(name => !pickedNames.includes(name));
    }

    // 텍스트 영역 동기화
    elements.nameInputArea.value = state.initialList.join('\n');
    saveToLocalStorage();

    updateUI();
    showToast(`✅ 학생 ${names.length}명이 등록되었습니다!`);

    // 명단이 적용되면 자동으로 남은 명단 칩 탭으로 전환
    switchTab('list');
    return true;
  }

  // ------------------------------------------------------------------------
  // 5. 화면(UI) 렌더링 업데이트
  // ------------------------------------------------------------------------
  function updateUI() {
    const totalCount = state.initialList.length;
    const remainingCount = state.waitingList.length;
    const pickedCount = state.pickedList.length;

    // 카운트 뱃지 업데이트
    elements.waitingCountBadge.textContent = `대기: ${remainingCount}명`;
    elements.totalCountText.textContent = totalCount;
    elements.remainingCountText.textContent = remainingCount;
    elements.pickedCountBadge.textContent = `${pickedCount}명 뽑힘`;

    // 칩 렌더링
    renderStudentChips();

    // 결과 히스토리 렌더링
    renderHistory();

    // 뽑기 버튼 활성화 상태
    if (remainingCount === 0) {
      elements.stageStatusBadge.textContent = totalCount > 0 ? '모든 학생 추첨 완료' : '명단을 입력해주세요';
      elements.stageStatusBadge.className = 'badge badge-soft';
      elements.drawBtn.disabled = true;
      if (totalCount > 0 && pickedCount > 0 && !state.isDrawing) {
        elements.rollerNames.innerHTML = '<span class="placeholder-text">🎉 모든 학생이 뽑혔습니다!</span>';
      }
    } else {
      elements.stageStatusBadge.textContent = state.isDrawing ? '추첨 진행 중...' : `남은 학생: ${remainingCount}명`;
      elements.stageStatusBadge.className = state.isDrawing ? 'badge badge-primary' : 'badge badge-soft';
      elements.drawBtn.disabled = state.isDrawing;
    }
  }

  // 왼쪽 대기 학생 칩(Chip) 렌더링
  function renderStudentChips() {
    elements.studentChipContainer.innerHTML = '';

    if (state.waitingList.length === 0) {
      elements.studentChipContainer.innerHTML = `
        <div class="empty-chips-notice">
          ${state.initialList.length === 0 ? '등록된 학생이 없습니다.<br>✏️ 명단 편집에서 이름을 입력하세요.' : '✨ 모든 학생이 뽑혔습니다!'}
        </div>
      `;
      return;
    }

    state.waitingList.forEach((name, index) => {
      const chip = document.createElement('div');
      chip.className = 'student-chip';
      chip.dataset.index = index;
      chip.dataset.name = name;

      const nameSpan = document.createElement('span');
      nameSpan.textContent = name;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-chip-btn';
      removeBtn.innerHTML = '&times;';
      removeBtn.title = '이 학생 제외';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeStudentFromWaiting(index);
      });

      chip.appendChild(nameSpan);
      chip.appendChild(removeBtn);
      elements.studentChipContainer.appendChild(chip);
    });
  }

  // 개별 학생 대기 목록에서 제외
  function removeStudentFromWaiting(index) {
    if (state.isDrawing) return;
    const removedName = state.waitingList[index];
    state.waitingList.splice(index, 1);
    updateUI();
    showToast(`🗑️ '${removedName}' 학생을 대기 목록에서 제외했습니다.`);
  }

  // 하단 결과 히스토리 렌더링
  function renderHistory() {
    elements.historyListContainer.innerHTML = '';

    if (state.pickedList.length === 0) {
      elements.historyListContainer.innerHTML = `
        <div class="empty-history-notice">
          아직 뽑힌 학생이 없습니다. 오른쪽에서 뽑기를 시작해 보세요!
        </div>
      `;
      return;
    }

    state.pickedList.forEach(item => {
      const card = document.createElement('div');
      card.className = 'result-card';
      card.innerHTML = `
        <span class="rank-badge">${item.order}</span>
        <span class="result-name">${item.name}</span>
        <span class="result-time">${item.time}</span>
      `;
      elements.historyListContainer.appendChild(card);
    });
  }

  // ------------------------------------------------------------------------
  // 6. 탭 전환 (명단 편집 vs 남은 명단)
  // ------------------------------------------------------------------------
  function switchTab(tab) {
    state.activeTab = tab;
    if (tab === 'edit') {
      elements.editModeBtn.classList.add('active');
      elements.listModeBtn.classList.remove('active');
      elements.editView.classList.add('active');
      elements.listView.classList.remove('active');
    } else {
      elements.listModeBtn.classList.add('active');
      elements.editModeBtn.classList.remove('active');
      elements.listView.classList.add('active');
      elements.editView.classList.remove('active');
    }
  }

  // ------------------------------------------------------------------------
  // 7. 핵심 추첨(Draw) 로직
  // ------------------------------------------------------------------------
  function drawRandomStudent() {
    if (state.isDrawing) return;
    initAudioContext();

    if (state.waitingList.length === 0) {
      playNoticeSound();
      showToast('⚠️ 남은 학생이 없습니다! [명단 복원]을 누르거나 새 명단을 등록하세요.');
      return;
    }

    state.isDrawing = true;
    updateUI();

    // 초기 시각 효과 준비
    elements.winnerAnnouncement.classList.remove('show');
    elements.displayBox.classList.remove('winner-highlight');
    elements.displayBox.classList.add('rolling');

    // 당첨 대상 인덱스 무작위 결정
    const winnerIndex = Math.floor(Math.random() * state.waitingList.length);
    const winnerName = state.waitingList[winnerIndex];

    // 롤링 애니메이션 설정
    const isFast = state.fastMode || state.waitingList.length === 1;
    const totalRollingTime = isFast ? 900 : 2500; // 0.9초 or 2.5초
    const startTime = performance.now();
    let lastTickTime = 0;
    let stepCount = 0;

    function rollFrame(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / totalRollingTime, 1);

      // 점점 느려지는 이징 (Ease-out) 계산
      // 진행도에 따라 인터벌을 점점 늘림 (기본 50ms ~ 끝날 땐 220ms)
      const currentInterval = 50 + Math.pow(progress, 2.5) * 180;

      if (currentTime - lastTickTime >= currentInterval) {
        lastTickTime = currentTime;
        stepCount++;

        // 무작위로 아무 학생 이름이나 노출 (대기자 목록 중)
        const randomTempName = state.waitingList[Math.floor(Math.random() * state.waitingList.length)];
        elements.rollerNames.textContent = randomTempName;

        // 음정이 살짝 변하는 비프음
        const baseFreq = 500 + (stepCount % 8) * 45;
        playTickSound(baseFreq);
      }

      if (progress < 1) {
        requestAnimationFrame(rollFrame);
      } else {
        // 추첨 완료 및 결과 발표!
        finalizeWinner(winnerIndex, winnerName);
      }
    }

    requestAnimationFrame(rollFrame);
  }

  // 당첨 확정 후속 처리
  function finalizeWinner(winnerIndex, winnerName) {
    // 1. 대형 디스플레이에 최종 당첨자 고정
    elements.displayBox.classList.remove('rolling');
    elements.displayBox.classList.add('winner-highlight');
    elements.rollerNames.textContent = winnerName;

    // 2. 축하 안내 텍스트 표시
    elements.winnerAnnouncement.innerHTML = `🎉 <strong>${state.pickedList.length + 1}번째 당첨: ${winnerName}</strong> 🎉`;
    elements.winnerAnnouncement.classList.add('show');

    // 3. 사운드 및 폭죽 발사
    playFanfareSound();
    confetti.start();

    // 4. 왼쪽 목록에서 당첨 학생 칩 애니메이션 후 제거
    const targetChip = elements.studentChipContainer.querySelector(`.student-chip[data-name="${winnerName}"]`);
    if (targetChip) {
      targetChip.classList.add('fading-out');
    }

    setTimeout(() => {
      // 데이터에서 제외
      state.waitingList.splice(winnerIndex, 1);

      // 5. 하단 결과 목록에 추가
      const newPickedItem = {
        name: winnerName,
        order: state.pickedList.length + 1,
        time: formatCurrentTime()
      };
      state.pickedList.push(newPickedItem);

      // 6. 상태 해제 및 UI 갱신
      state.isDrawing = false;
      updateUI();

      // 결과 목록 스크롤 최신 카드로 이동
      elements.historyListContainer.scrollTop = elements.historyListContainer.scrollHeight;
    }, 300);
  }

  // ------------------------------------------------------------------------
  // 8. 이벤트 바인딩 및 부가 기능
  // ------------------------------------------------------------------------

  // [명단 적용하기] 버튼
  elements.applyNamesBtn.addEventListener('click', () => {
    initAudioContext();
    const parsed = parseNamesFromText(elements.nameInputArea.value);
    applyNames(parsed, true);
  });

  // [예시 명단] 버튼
  elements.sampleNamesBtn.addEventListener('click', () => {
    initAudioContext();
    const sampleStudents = [
      '1번 강민재', '2번 고은우', '3번 김서아', '4번 김도윤', '5번 문지후',
      '6번 박하은', '7번 박예준', '8번 손유진', '9번 송시우', '10번 안지우',
      '11번 윤서진', '12번 이지아', '13번 이태양', '14번 임수아', '15번 장우진',
      '16번 정다은', '17번 조민호', '18번 최하린', '19번 한승우', '20번 황채원'
    ];
    elements.nameInputArea.value = sampleStudents.join('\n');
    applyNames(sampleStudents, true);
  });

  // [비우기] 버튼
  elements.clearNamesBtn.addEventListener('click', () => {
    if (confirm('학생 입력창과 등록된 명단을 모두 비우시겠습니까?')) {
      elements.nameInputArea.value = '';
      state.initialList = [];
      state.waitingList = [];
      state.pickedList = [];
      saveToLocalStorage();
      elements.rollerNames.innerHTML = '<span class="placeholder-text">🎲 아래 \'뽑기\' 버튼을 눌러주세요!</span>';
      elements.winnerAnnouncement.classList.remove('show');
      updateUI();
      showToast('🗑️ 명단이 모두 초기화되었습니다.');
    }
  });

  // [남은 순서 섞기] 버튼
  elements.shuffleBtn.addEventListener('click', () => {
    if (state.isDrawing || state.waitingList.length <= 1) return;
    initAudioContext();
    // Fisher-Yates 셔플
    for (let i = state.waitingList.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [state.waitingList[i], state.waitingList[j]] = [state.waitingList[j], state.waitingList[i]];
    }
    renderStudentChips();
    playTickSound(700);
    showToast('🔀 남은 학생 순서를 무작위로 섞었습니다.');
  });

  // [뽑기] 버튼 클릭
  elements.drawBtn.addEventListener('click', () => {
    drawRandomStudent();
  });

  // [스페이스바] 단축키 지원
  window.addEventListener('keydown', (e) => {
    // 텍스트에어리어 입력 중일 때는 스페이스바 동작 방지
    if (document.activeElement === elements.nameInputArea) return;

    if (e.code === 'Space') {
      e.preventDefault();
      drawRandomStudent();
    }
  });

  // 탭 전환 버튼 이벤트
  elements.editModeBtn.addEventListener('click', () => switchTab('edit'));
  elements.listModeBtn.addEventListener('click', () => switchTab('list'));

  // 빠른 뽑기 체크박스
  elements.fastModeCheckbox.addEventListener('change', (e) => {
    state.fastMode = e.target.checked;
    showToast(state.fastMode ? '⚡ 빠른 뽑기 모드가 켜졌습니다.' : '⏱️ 기본 애니메이션 모드로 전환되었습니다.');
  });

  // 소리 On/Off 토글
  elements.soundToggleBtn.addEventListener('click', () => {
    initAudioContext();
    state.soundEnabled = !state.soundEnabled;
    elements.soundIcon.textContent = state.soundEnabled ? '🔊' : '🔇';
    elements.soundToggleBtn.querySelector('.btn-text').textContent = state.soundEnabled ? '소리 켬' : '소리 끔';
    showToast(state.soundEnabled ? '🔊 효과음이 켜졌습니다.' : '🔇 효과음이 꺼졌습니다.');
  });

  // 전체화면 토글
  elements.fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      elements.fullscreenBtn.querySelector('.btn-text').textContent = '화면 복귀';
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        elements.fullscreenBtn.querySelector('.btn-text').textContent = '전체화면';
      }
    }
  });

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      elements.fullscreenBtn.querySelector('.btn-text').textContent = '전체화면';
    } else {
      elements.fullscreenBtn.querySelector('.btn-text').textContent = '화면 복귀';
    }
  });

  // [결과 클립보드 복사] 버튼
  elements.copyResultBtn.addEventListener('click', () => {
    if (state.pickedList.length === 0) {
      showToast('⚠️ 복사할 결과가 없습니다.');
      return;
    }

    const textToCopy = state.pickedList
      .map(item => `${item.order}순위: ${item.name}`)
      .join('\n');

    navigator.clipboard.writeText(textToCopy).then(() => {
      showToast('📋 순위 결과가 클립보드에 복사되었습니다!');
    }).catch(() => {
      showToast('⚠️ 복사에 실패했습니다. 브라우저 권한을 확인해주세요.');
    });
  });

  // [명단 복원 및 다시 뽑기] 버튼
  elements.resetOnlyPickedBtn.addEventListener('click', () => {
    if (state.initialList.length === 0) {
      showToast('⚠️ 먼저 학생 명단을 등록해주세요.');
      return;
    }
    if (confirm('뽑힌 결과를 초기화하고 전체 학생을 다시 대기 목록으로 복원하시겠습니까?')) {
      state.waitingList = [...state.initialList];
      state.pickedList = [];
      elements.rollerNames.innerHTML = '<span class="placeholder-text">🎲 아래 \'뽑기\' 버튼을 눌러주세요!</span>';
      elements.winnerAnnouncement.classList.remove('show');
      elements.displayBox.classList.remove('winner-highlight');
      updateUI();
      showToast('🔄 모든 학생이 대기 목록으로 복원되었습니다!');
    }
  });

  // [완전 초기화] 버튼
  if (elements.resetAllBtn) {
    elements.resetAllBtn.addEventListener('click', () => {
      initAudioContext();
      if (confirm('등록된 학생 명단과 뽑기 기록을 모두 삭제하고 처음 상태로 완전 초기화하시겠습니까?')) {
        state.initialList = [];
        state.waitingList = [];
        state.pickedList = [];
        elements.nameInputArea.value = '';
        try {
          localStorage.removeItem(STORAGE_KEY);
        } catch (e) {
          console.warn('LocalStorage 삭제 실패:', e);
        }
        elements.rollerNames.innerHTML = '<span class="placeholder-text">🎲 아래 \'뽑기\' 버튼을 눌러주세요!</span>';
        elements.winnerAnnouncement.classList.remove('show');
        elements.displayBox.classList.remove('winner-highlight');
        switchTab('edit');
        updateUI();
        playNoticeSound();
        showToast('✨ 모든 명단과 기록이 완전 초기화되었습니다.');
      }
    });
  }

  // ------------------------------------------------------------------------
  // 9. 초기화 실행
  // ------------------------------------------------------------------------
  const savedNames = loadFromLocalStorage();
  if (savedNames && savedNames.length > 0) {
    applyNames(savedNames, true);
  } else {
    // 저장된 명단이 없으면 초기 상태 렌더링
    updateUI();
  }
});

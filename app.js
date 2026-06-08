document.addEventListener('DOMContentLoaded', () => {
  // --- UI Elements ---
  const tabUpload = document.getElementById('tab-upload');
  const tabPaste = document.getElementById('tab-paste');
  const uploadZone = document.getElementById('upload-zone');
  const pasteZone = document.getElementById('paste-zone');
  const fileInput = document.getElementById('file-input');
  const fileInfo = document.getElementById('file-info');
  const selectedFileName = document.getElementById('selected-file-name');
  const removeFileBtn = document.getElementById('remove-file-btn');
  const pasteTextarea = document.getElementById('paste-textarea');
  const pasteFilename = document.getElementById('paste-filename');
  const btnAnalyze = document.getElementById('btn-analyze');

  const emptyState = document.getElementById('empty-state');
  const loadingState = document.getElementById('loading-state');
  const loadingStep = document.getElementById('loading-step');
  const resultsContent = document.getElementById('results-content');

  const scoreCircle = document.getElementById('score-circle');
  const scoreText = document.getElementById('score-text');
  const scoreLabel = document.getElementById('score-label');
  const reviewSummary = document.getElementById('review-summary');
  const issuesCount = document.getElementById('issues-count');
  const issuesListContainer = document.getElementById('issues-list-container');
  const sourceLineNumbers = document.getElementById('source-line-numbers');
  const sourceCodeDisplay = document.getElementById('source-code-display');
  const fixedLineNumbers = document.getElementById('fixed-line-numbers');
  const fixedCodeDisplay = document.getElementById('fixed-code-display');
  const btnCopyFixed = document.getElementById('btn-copy-fixed');
  const zipSelectorContainer = document.getElementById('zip-selector-container');
  const zipFileSelect = document.getElementById('zip-file-select');

  // --- State Variables ---
  let activeInputMode = 'upload'; // 'upload' | 'paste'
  let selectedFileContent = '';
  let selectedName = '';
  let zipFileInstance = null;
  let analysisResult = null;

  // --- Input Mode Tab Toggles ---
  tabUpload.addEventListener('click', () => {
    activeInputMode = 'upload';
    tabUpload.classList.add('active');
    tabPaste.classList.remove('active');
    uploadZone.classList.remove('hidden');
    if (zipFileInstance) zipSelectorContainer.classList.remove('hidden');
    pasteZone.classList.add('hidden');
    checkInputState();
  });

  tabPaste.addEventListener('click', () => {
    activeInputMode = 'paste';
    tabPaste.classList.add('active');
    tabUpload.classList.remove('active');
    pasteZone.classList.remove('hidden');
    uploadZone.classList.add('hidden');
    zipSelectorContainer.classList.add('hidden');
    checkInputState();
  });

  // --- Drag and Drop File Handlers ---
  ['dragenter', 'dragover'].forEach(eventName => {
    uploadZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      uploadZone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    uploadZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      uploadZone.classList.remove('dragover');
    }, false);
  });

  uploadZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      handleFileSelection(files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelection(e.target.files[0]);
    }
  });

  removeFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetFileSelection();
  });

  zipFileSelect.addEventListener('change', async (e) => {
    await loadZipFileContent(e.target.value);
  });

  pasteTextarea.addEventListener('input', checkInputState);
  pasteFilename.addEventListener('input', checkInputState);

  // --- Core File Reader Logic ---
  async function handleFileSelection(file) {
    if (file.name.toLowerCase().endsWith('.zip')) {
      try {
        const zip = await JSZip.loadAsync(file);
        zipFileInstance = zip;
        
        // Filter out folders and common binary extensions
        const ignoredExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.pdf', '.zip', '.gz', '.mp4', '.mov', '.mp3', '.class', '.exe', '.dll', '.jar', '.woff', '.woff2', '.ttf', '.eot'];
        const ignoredNames = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'go.sum', 'cargo.lock', 'composer.lock'];
        
        const files = Object.keys(zip.files).filter(name => {
          const isDir = zip.files[name].dir;
          const nameLower = name.toLowerCase();
          const hasIgnoredExt = ignoredExtensions.some(ext => nameLower.endsWith(ext));
          const hasIgnoredName = ignoredNames.some(ignoredName => nameLower.endsWith(ignoredName));
          return !isDir && !hasIgnoredExt && !hasIgnoredName;
        });

        if (files.length === 0) {
          alert('No reviewable text-based source files found inside the ZIP package.');
          resetFileSelection();
          return;
        }

        // Populate select list
        zipFileSelect.innerHTML = '';
        files.forEach(filename => {
          const opt = document.createElement('option');
          opt.value = filename;
          opt.textContent = filename;
          zipFileSelect.appendChild(opt);
        });

        // Show selector container
        zipSelectorContainer.classList.remove('hidden');

        // Update UI file representation
        selectedFileName.textContent = `${file.name} (ZIP Package)`;
        fileInfo.classList.remove('hidden');
        document.querySelector('.upload-icon').classList.add('hidden');
        document.querySelector('.upload-title').classList.add('hidden');
        document.querySelector('.upload-subtitle').classList.add('hidden');
        document.querySelector('.or-divider').classList.add('hidden');
        document.querySelector('.file-btn').classList.add('hidden');

        // Automatically load first file content
        await loadZipFileContent(files[0]);

      } catch (err) {
        alert(`Failed to parse ZIP package: ${err.message}`);
        resetFileSelection();
      }
    } else {
      // Standard file upload
      zipSelectorContainer.classList.add('hidden');
      zipFileInstance = null;

      const reader = new FileReader();
      reader.onload = (e) => {
        selectedFileContent = e.target.result;
        selectedName = file.name;
        
        // Update UI file representation
        selectedFileName.textContent = file.name;
        fileInfo.classList.remove('hidden');
        document.querySelector('.upload-icon').classList.add('hidden');
        document.querySelector('.upload-title').classList.add('hidden');
        document.querySelector('.upload-subtitle').classList.add('hidden');
        document.querySelector('.or-divider').classList.add('hidden');
        document.querySelector('.file-btn').classList.add('hidden');

        checkInputState();
      };
      reader.readAsText(file);
    }
  }

  async function loadZipFileContent(filename) {
    if (!zipFileInstance) return;
    try {
      const content = await zipFileInstance.files[filename].async('string');
      selectedFileContent = content;
      selectedName = filename;
      checkInputState();
    } catch (err) {
      alert(`Failed to load ZIP file entry: ${err.message}`);
    }
  }

  function resetFileSelection() {
    selectedFileContent = '';
    selectedName = '';
    zipFileInstance = null;
    fileInput.value = '';
    fileInfo.classList.add('hidden');
    zipSelectorContainer.classList.add('hidden');
    document.querySelector('.upload-icon').classList.remove('hidden');
    document.querySelector('.upload-title').classList.remove('hidden');
    document.querySelector('.upload-subtitle').classList.remove('hidden');
    document.querySelector('.or-divider').classList.remove('hidden');
    document.querySelector('.file-btn').classList.remove('hidden');
    checkInputState();
  }

  function checkInputState() {
    if (activeInputMode === 'upload') {
      btnAnalyze.disabled = !selectedFileContent;
    } else {
      btnAnalyze.disabled = !pasteTextarea.value.trim();
    }
  }

  // --- Run Code Analysis ---
  btnAnalyze.addEventListener('click', async () => {
    let code = '';
    let name = '';

    if (activeInputMode === 'upload') {
      code = selectedFileContent;
      name = selectedName;
    } else {
      code = pasteTextarea.value;
      name = pasteFilename.value.trim() || 'pasted-snippet.js';
    }

    if (!code) return;

    // Show Loading
    emptyState.classList.add('hidden');
    resultsContent.classList.add('hidden');
    loadingState.classList.remove('hidden');

    const loadingSteps = [
      'Sending code package...',
      'Analyzing logic flow...',
      'Inspecting security vulnerabilities...',
      'Auditing style and performance...',
      'Generating refactored recommendations...'
    ];
    let stepIndex = 0;
    loadingStep.textContent = loadingSteps[0];
    const loadingInterval = setInterval(() => {
      stepIndex = (stepIndex + 1) % loadingSteps.length;
      loadingStep.textContent = loadingSteps[stepIndex];
    }, 2500);

    try {
      const response = await fetch('/api/upload-review', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ code, filename: name })
      });

      const data = await response.json();
      clearInterval(loadingInterval);

      if (data.success && data.analysis) {
        analysisResult = data.analysis;
        renderResults(code, data.analysis);
      } else {
        alert(`Analysis failed: ${data.error || 'Unknown error'}`);
        loadingState.classList.add('hidden');
        emptyState.classList.remove('hidden');
      }
    } catch (err) {
      clearInterval(loadingInterval);
      alert(`API Connection Error: ${err.message}`);
      loadingState.classList.add('hidden');
      emptyState.classList.remove('hidden');
    }
  });

  // --- Render Results ---
  function renderResults(originalCode, analysis) {
    loadingState.classList.add('hidden');
    resultsContent.classList.remove('hidden');

    // 1. Score Circle
    const score = analysis.score || 0;
    scoreText.textContent = score;
    
    // Set circle stroke and color category
    const radius = 15.9155;
    const circumference = 2 * Math.PI * radius;
    const strokeDash = (score / 100) * circumference;
    scoreCircle.style.strokeDasharray = `${strokeDash}, ${circumference}`;

    scoreCircle.className = 'circle';
    if (score < 60) {
      scoreCircle.classList.add('low');
      scoreLabel.textContent = 'NEEDS IMPROVEMENT';
      scoreLabel.style.color = 'var(--color-red)';
    } else if (score < 85) {
      scoreCircle.classList.add('medium');
      scoreLabel.textContent = 'GOOD QUALITY';
      scoreLabel.style.color = 'var(--color-amber)';
    } else {
      scoreCircle.classList.add('high');
      scoreLabel.textContent = 'EXCELLENT';
      scoreLabel.style.color = 'var(--color-green)';
    }

    // 2. Executive Summary
    reviewSummary.textContent = analysis.summary || 'No summary available.';

    // 3. Issues List
    issuesListContainer.innerHTML = '';
    const issues = analysis.issues || [];
    issuesCount.textContent = issues.length;

    if (issues.length === 0) {
      issuesListContainer.innerHTML = `
        <div class="empty-state" style="padding: 2rem 0;">
          <span class="material-icons-round" style="font-size: 3rem; color: var(--color-green); margin-bottom: 0.5rem;">check_circle</span>
          <h4>No Issues Found</h4>
          <p style="font-size: 0.85rem;">This file looks clean and follows top development patterns!</p>
        </div>
      `;
    } else {
      issues.forEach(issue => {
        const typeEmoji = {
          bug: '🐛',
          security: '🔒',
          performance: '⚡',
          style: '🎨'
        }[issue.type] || '⚠️';

        const card = document.createElement('div');
        card.className = `issue-item ${issue.type || 'bug'}`;
        card.innerHTML = `
          <div class="issue-meta">
            <span class="issue-type">${issue.type || 'Bug'}</span>
            <span class="issue-line">Line ${issue.line || 'N/A'}</span>
          </div>
          <p class="issue-message">${typeEmoji} ${escapeHtml(issue.message)}</p>
          ${issue.fix ? `<div class="issue-fix">${escapeHtml(issue.fix)}</div>` : ''}
        `;
        issuesListContainer.appendChild(card);
      });
    }

    // 4. Source Code View
    renderCode(originalCode, sourceCodeDisplay, sourceLineNumbers);

    // 5. Fixed Code View
    renderCode(analysis.fixedCode || originalCode, fixedCodeDisplay, fixedLineNumbers);
  }

  function renderCode(codeText, displayEl, linesEl) {
    displayEl.textContent = codeText;
    const linesCount = codeText.split('\n').length;
    let linesHtml = '';
    for (let i = 1; i <= linesCount; i++) {
      linesHtml += `${i}\n`;
    }
    linesEl.textContent = linesHtml;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
  }

  // --- Copy Fixed Code Helper ---
  btnCopyFixed.addEventListener('click', () => {
    if (!analysisResult || !analysisResult.fixedCode) return;
    navigator.clipboard.writeText(analysisResult.fixedCode).then(() => {
      const originalText = btnCopyFixed.innerHTML;
      btnCopyFixed.innerHTML = '<span class="material-icons-round">done</span> Copied!';
      setTimeout(() => {
        btnCopyFixed.innerHTML = originalText;
      }, 2000);
    });
  });

  // --- Tabs Navigation for Result Viewers ---
  const viewerTabBtns = document.querySelectorAll('.viewer-tab-btn');
  const viewerTabPanels = document.querySelectorAll('.viewer-tab-panel');

  viewerTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      
      // Update button highlights
      viewerTabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update panel visibility
      viewerTabPanels.forEach(panel => {
        panel.classList.remove('active');
        if (panel.id === `panel-${targetTab}`) {
          panel.classList.add('active');
        }
      });
    });
  });
});

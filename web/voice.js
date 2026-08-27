(() => {
  const button = document.getElementById('voiceBtn');
  const toggle = document.getElementById('voiceToggle');
  const box = document.getElementById('voiceStatus');
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  window.luminaVoiceEnabled = localStorage.getItem('lumina-navigation-voice') !== 'off';
  let handsfree = localStorage.getItem('lumina-handsfree') === 'on';
  let wakeWord = localStorage.getItem('lumina-wake-word') !== 'off';

  function renderVoiceState() {
    if (!toggle) return;
    toggle.textContent = window.luminaVoiceEnabled ? '🔊' : '🔇';
    toggle.classList.toggle('voiceOff', !window.luminaVoiceEnabled);
    toggle.title = window.luminaVoiceEnabled ? 'Φωνή ενεργή' : 'Φωνή ανενεργή';
  }
  toggle?.addEventListener('click', () => {
    window.luminaVoiceEnabled = !window.luminaVoiceEnabled;
    localStorage.setItem('lumina-navigation-voice', window.luminaVoiceEnabled ? 'on' : 'off');
    if (!window.luminaVoiceEnabled) speechSynthesis?.cancel();
    renderVoiceState();
  });
  renderVoiceState();
  let lastCommand = '';
  async function handleCommand(text) {
    if (text === lastCommand) return;
    lastCommand = text;
    const intent = window.luminaParseIntent?.(text) || { type: 'unknown' };
    const result = await window.luminaJulieAction?.(intent);
    if (result) {
      if (box) { box.textContent = result; box.classList.remove('hidden'); }
      window.luminaSay?.(result, 'assistant');
    }
    window.setTimeout(() => { lastCommand = ''; }, 1500);
    return { intent, result };
  }
  window.luminaTestJulie = (text) => handleCommand(text);
  let recognition;
  let manuallyStopped = false;
  window.luminaSetHandsfree = (enabled) => { handsfree = enabled; manuallyStopped = !enabled; if (!SpeechRecognition) { if (box) { box.textContent = enabled ? 'Το hands-free δεν υποστηρίζεται από αυτόν τον browser.' : 'Το hands-free απενεργοποιήθηκε.'; box.classList.remove('hidden'); } return; } if (enabled) startRecognition(); else if (recognition) { recognition.stop(); recognition = null; } };
  if (!button || !SpeechRecognition) return;
  function startRecognition() { if (recognition || !handsfree && manuallyStopped) return; recognition = new SpeechRecognition(); recognition.lang = 'el-GR'; recognition.interimResults = false; recognition.continuous = handsfree; recognition.onresult = (event) => { const text = event.results[0][0].transcript; if (wakeWord && handsfree && !/\b(julie|τζούλι|τζούλη)\b/i.test(text)) return; if (box) { box.textContent = `Άκουσα: «${text}»`; box.classList.remove('hidden'); } handleCommand(text).catch(() => { if (box) box.textContent = 'Δεν μπόρεσα να ολοκληρώσω την εντολή.'; window.luminaSay?.('Δεν μπόρεσα να ολοκληρώσω την εντολή.', 'assistant'); }); }; recognition.onend = () => { recognition = null; if (handsfree && !manuallyStopped) window.setTimeout(startRecognition, 250); }; recognition.onerror = () => { recognition = null; if (handsfree && !manuallyStopped) window.setTimeout(startRecognition, 1000); }; recognition.start(); }
  button.addEventListener('click', () => {
    if (recognition) { manuallyStopped = true; recognition.stop(); recognition = null; return; }
    manuallyStopped = false; startRecognition();
  });
  if (handsfree) startRecognition();
})();

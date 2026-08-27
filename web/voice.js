(() => {
  const button = document.getElementById('voiceBtn');
  const toggle = document.getElementById('voiceToggle');
  const box = document.getElementById('voiceStatus');
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  window.luminaVoiceEnabled = localStorage.getItem('lumina-navigation-voice') !== 'off';

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
  if (!button || !SpeechRecognition) return;
  let recognition;
  button.addEventListener('click', () => {
    if (recognition) { recognition.stop(); return; }
    recognition = new SpeechRecognition();
    recognition.lang = 'el-GR';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      if (box) { box.textContent = `Άκουσα: «${text}»`; box.classList.remove('hidden'); }
      const normalized = text.toLocaleLowerCase('el-GR');
      if (/σταμάτα|τέλος/.test(normalized)) document.getElementById('stopBtn')?.click();
      else if (/ξεκίνα|έναρξη/.test(normalized)) document.getElementById('startBtn')?.click();
    };
    recognition.onend = () => { recognition = null; };
    recognition.start();
  });
})();

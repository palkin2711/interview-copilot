(() => {
  "use strict";

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const defaultProfile = `I am an experienced digital marketing freelancer from India. I have 13 years of experience with Google Ads and Meta Ads. My work includes campaign strategy, search and performance campaigns, conversion tracking with GA4 and GTM, remarketing, reporting, and ongoing optimisation. I communicate clearly, start with an account audit, and make decisions using performance data. Use only the additional truthful details I save here.`;
  const state = {
    recognition: null,
    listening: false,
    processing: false,
    restartTimer: null,
    silenceTimer: null,
    finalTranscript: "",
    lastSubmitted: "",
    sessionStartedAt: null,
    history: []
  };

  const els = Object.fromEntries([
    "settingsButton", "settingsDialog", "closeSettings", "profileForm", "profileInput",
    "jobInput", "languageInput", "silenceInput", "autoAnswerInput", "resumeFile",
    "profileMessage", "statusDot", "statusTitle", "statusCopy", "meterFill", "questionText",
    "interimText", "answerText", "answerLoading", "answerTimer", "startButton",
    "startButtonText", "testButton", "browserNotice", "editQuestionButton", "questionDialog",
    "questionForm", "manualQuestionInput", "closeQuestion"
  ].map((id) => [id, document.getElementById(id)]));

  function loadSettings() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem("interviewCopilotSettings") || "{}"); } catch (_) {}
    els.profileInput.value = saved.profile || defaultProfile;
    els.jobInput.value = saved.jobDescription || "";
    els.languageInput.value = saved.language || "en-US";
    els.silenceInput.value = String(saved.silenceMs || 1800);
    els.autoAnswerInput.checked = saved.autoAnswer !== false;
    return getSettings();
  }

  function getSettings() {
    return {
      profile: els.profileInput.value.trim(),
      jobDescription: els.jobInput.value.trim(),
      language: els.languageInput.value,
      silenceMs: Number(els.silenceInput.value) || 1800,
      autoAnswer: els.autoAnswerInput.checked
    };
  }

  function saveSettings() {
    const settings = getSettings();
    localStorage.setItem("interviewCopilotSettings", JSON.stringify(settings));
    els.profileMessage.textContent = "Profile saved on this device.";
    window.setTimeout(() => { els.profileMessage.textContent = ""; }, 1800);
    return settings;
  }

  function setStatus(type, title, copy) {
    els.statusDot.className = `status-dot${type ? ` ${type}` : ""}`;
    els.statusTitle.textContent = title;
    els.statusCopy.textContent = copy;
    els.meterFill.style.width = type === "listening" ? "72%" : type === "thinking" ? "100%" : "0";
  }

  function looksLikeQuestion(text) {
    const value = text.trim().toLowerCase();
    if (value.length < 12) return false;
    if (/^(i|my|we|our)\b/.test(value)) return false;
    const openers = /^(what|why|how|when|where|which|who|whose|can|could|would|will|do|does|did|are|is|have|has|tell|describe|explain|walk|share|give|take|talk|please|suppose|imagine|if)\b/;
    const interviewPhrases = /(your experience|your approach|you handled|you manage|you improve|you measure|example of|tell me|walk me through|why should|why do you|what would|could you|can you|would you)/;
    return value.endsWith("?") || openers.test(value) || interviewPhrases.test(value);
  }

  function normalizeTranscript(text) {
    return text.replace(/\s+/g, " ").replace(/\s+([,.?!])/g, "$1").trim();
  }

  function scheduleQuestionDetection() {
    window.clearTimeout(state.silenceTimer);
    const { silenceMs, autoAnswer } = getSettings();
    state.silenceTimer = window.setTimeout(() => {
      const candidate = normalizeTranscript(state.finalTranscript);
      if (!candidate || candidate === state.lastSubmitted || state.processing) return;
      els.questionText.textContent = candidate;
      if (autoAnswer && looksLikeQuestion(candidate)) {
        generateAnswer(candidate);
      } else if (autoAnswer) {
        setStatus("listening", "Listening for a complete question", "The last speech did not look like a finished interview question.");
      }
    }, silenceMs);
  }

  function createRecognition() {
    if (!SpeechRecognition) return null;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = getSettings().language;

    recognition.onstart = () => {
      setStatus("listening", "Listening continuously", "Keep this screen open and place the phone near the laptop speaker.");
    };

    recognition.onresult = (event) => {
      let interim = "";
      let newFinal = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const phrase = event.results[i][0].transcript;
        if (event.results[i].isFinal) newFinal += `${phrase} `;
        else interim += phrase;
      }
      if (newFinal) {
        state.finalTranscript = normalizeTranscript(`${state.finalTranscript} ${newFinal}`);
        els.questionText.textContent = state.finalTranscript;
        scheduleQuestionDetection();
      }
      els.interimText.textContent = interim ? `Hearing: ${interim}` : "";
    };

    recognition.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setStatus("error", "Microphone permission blocked", "Allow microphone access in Chrome site settings, then try again.");
        stopListening();
      } else if (event.error !== "no-speech" && event.error !== "aborted") {
        setStatus("error", "Listening interrupted", `Speech recognition reported: ${event.error}. Retrying automatically.`);
      }
    };

    recognition.onend = () => {
      if (state.listening) {
        state.restartTimer = window.setTimeout(() => {
          try {
            recognition.lang = getSettings().language;
            recognition.start();
          } catch (_) {}
        }, 350);
      }
    };
    return recognition;
  }

  function startListening() {
    if (!SpeechRecognition) {
      els.browserNotice.hidden = false;
      setStatus("error", "Live listening is unsupported", "Open the deployed app in the latest Google Chrome on Android.");
      return;
    }
    if (!getSettings().profile) {
      els.settingsDialog.showModal();
      els.profileMessage.textContent = "Add your truthful profile before starting.";
      return;
    }
    state.listening = true;
    state.sessionStartedAt = Date.now();
    state.finalTranscript = "";
    state.lastSubmitted = "";
    state.recognition = createRecognition();
    try {
      state.recognition.start();
      els.startButton.classList.add("active");
      els.startButtonText.textContent = "Stop listening";
    } catch (error) {
      setStatus("error", "Could not start listening", error.message);
      stopListening();
    }
  }

  function stopListening() {
    state.listening = false;
    window.clearTimeout(state.restartTimer);
    window.clearTimeout(state.silenceTimer);
    try { state.recognition?.abort(); } catch (_) {}
    state.recognition = null;
    els.startButton.classList.remove("active");
    els.startButtonText.textContent = "Start listening";
    els.interimText.textContent = "";
    setStatus("", "Listening stopped", "Press Start listening when you are ready.");
  }

  function updateTimer() {
    if (!state.sessionStartedAt || !state.listening) {
      els.answerTimer.textContent = "";
      return;
    }
    const seconds = Math.floor((Date.now() - state.sessionStartedAt) / 1000);
    const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
    const remainder = (seconds % 60).toString().padStart(2, "0");
    els.answerTimer.textContent = `${minutes}:${remainder}`;
  }

  async function generateAnswer(question) {
    const cleanQuestion = normalizeTranscript(question);
    if (!cleanQuestion || state.processing) return;
    state.processing = true;
    state.lastSubmitted = cleanQuestion;
    state.finalTranscript = "";
    els.questionText.textContent = cleanQuestion;
    els.answerLoading.hidden = false;
    els.answerText.hidden = true;
    setStatus("thinking", "Preparing your answer", "Using your saved profile and job description.");

    try {
      const settings = getSettings();
      const response = await fetch("/api/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: cleanQuestion,
          profile: settings.profile,
          jobDescription: settings.jobDescription,
          history: state.history
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to generate an answer.");
      els.answerText.textContent = data.answer;
      state.history.push({ question: cleanQuestion, answer: data.answer });
      state.history = state.history.slice(-6);
      setStatus(state.listening ? "listening" : "", state.listening ? "Listening for the next question" : "Answer ready", state.listening ? "You do not need to press anything for the next question." : "Review the answer in your own words.");
    } catch (error) {
      els.answerText.textContent = `Could not generate the answer: ${error.message}`;
      setStatus("error", "Answer generation failed", "Check the Gemini API key and internet connection, then try again.");
    } finally {
      state.processing = false;
      els.answerLoading.hidden = true;
      els.answerText.hidden = false;
    }
  }

  els.settingsButton.addEventListener("click", () => els.settingsDialog.showModal());
  els.closeSettings.addEventListener("click", () => els.settingsDialog.close());
  els.profileForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveSettings();
    window.setTimeout(() => els.settingsDialog.close(), 350);
  });
  els.resumeFile.addEventListener("change", async () => {
    const file = els.resumeFile.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".txt")) {
      els.profileMessage.textContent = "This first version reads .txt files. Copy PDF/DOCX text into the box above.";
      return;
    }
    els.profileInput.value = await file.text();
    els.profileMessage.textContent = "Resume text added. Save your profile.";
  });
  els.startButton.addEventListener("click", () => state.listening ? stopListening() : startListening());
  els.testButton.addEventListener("click", () => {
    els.manualQuestionInput.value = "Can you tell me about your experience managing Google Ads campaigns?";
    els.questionDialog.showModal();
  });
  els.editQuestionButton.addEventListener("click", () => {
    els.manualQuestionInput.value = els.questionText.textContent.includes("automatically") ? "" : els.questionText.textContent;
    els.questionDialog.showModal();
  });
  els.closeQuestion.addEventListener("click", () => els.questionDialog.close());
  els.questionForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const question = els.manualQuestionInput.value.trim();
    els.questionDialog.close();
    generateAnswer(question);
  });

  loadSettings();
  if (!SpeechRecognition) els.browserNotice.hidden = false;
  if (!localStorage.getItem("interviewCopilotSettings")) {
    window.setTimeout(() => els.settingsDialog.showModal(), 400);
  }
  window.setInterval(updateTimer, 1000);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
  }
})();

"use client";

import React, { useState, useEffect, useRef } from "react";
import styles from "./ubiai.module.css";
import {
  initialPage,
  mutations,
  phraseFamilies,
  choices,
  resolutions,
  PageState,
  Choice,
  Resolution,
  PresentationStep,
} from "./gameData";

interface ChatMessage {
  id: string;
  kind: "user" | "ai";
  text: string;
  tools?: PresentationStep[];
  phrase?: string;
}

interface StoredGame {
  v: number;
  currentSceneID: string;
  history: ChatMessage[];
  pageState: PageState;
  turn: number;
}

const STORAGE_KEY = "ubiai_game_session_v1";

export default function UbiAiPage() {
  const [view, setView] = useState<"start" | "play">("start");
  const [showAbout, setShowAbout] = useState(false);
  const [savedSession, setSavedSession] = useState<StoredGame | null>(null);

  // Game Engine State
  const [currentSceneID, setCurrentSceneID] = useState<string>("saga/open");
  const [pageState, setPageState] = useState<PageState>(initialPage);
  const [previewFlash, setPreviewFlash] = useState<boolean>(false);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [turn, setTurn] = useState<number>(1);

  // Current turn runtime animation state
  const [isAiThinking, setIsAiThinking] = useState<boolean>(false);
  const [activeTools, setActiveTools] = useState<PresentationStep[]>([]);
  const [activePhrase, setActivePhrase] = useState<string | null>(null);
  const [interimNote, setInterimNote] = useState<string | null>(null);
  const [streamingAiText, setStreamingAiText] = useState<string | null>(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);

  // Ending and quota warnings
  const [dismissQuotaWarning, setDismissQuotaWarning] = useState<boolean>(false);
  const [isEndingReached, setIsEndingReached] = useState<boolean>(false);

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const timeoutsRef = useRef<number[]>([]);

  // Load saved session on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.v === 1 && parsed.currentSceneID) {
          setSavedSession(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Save session when history changes (if not at ending)
  useEffect(() => {
    if (history.length > 0 && !isEndingReached) {
      try {
        const session: StoredGame = {
          v: 1,
          currentSceneID,
          history,
          pageState,
          turn,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
        setSavedSession(session);
      } catch {
        // ignore
      }
    }
  }, [currentSceneID, history, pageState, turn, isEndingReached]);

  // Auto-scroll chat on updates
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTo({
        top: chatScrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [history, isAiThinking, activeTools, activePhrase, streamingAiText, interimNote]);

  // Clean up timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach((t) => window.clearTimeout(t));
      timeoutsRef.current = [];
    };
  }, []);

  const addTimeout = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timeoutsRef.current.push(id);
    return id;
  };

  const handleStartGame = () => {
    timeoutsRef.current.forEach((t) => window.clearTimeout(t));
    timeoutsRef.current = [];
    setCurrentSceneID("saga/open");
    setPageState(initialPage);
    setHistory([]);
    setTurn(1);
    setIsEndingReached(false);
    setDismissQuotaWarning(false);
    setSelectedChoiceId(null);
    setView("play");
  };

  const handleResumeGame = () => {
    if (!savedSession) return;
    timeoutsRef.current.forEach((t) => window.clearTimeout(t));
    timeoutsRef.current = [];
    setCurrentSceneID(savedSession.currentSceneID);
    setPageState(savedSession.pageState);
    setHistory(savedSession.history);
    setTurn(savedSession.turn);
    setIsEndingReached(savedSession.currentSceneID === "ending");
    setSelectedChoiceId(null);
    setView("play");
  };

  const handleResetBaseline = () => {
    timeoutsRef.current.forEach((t) => window.clearTimeout(t));
    timeoutsRef.current = [];
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setSavedSession(null);
    setCurrentSceneID("saga/open");
    setPageState(initialPage);
    setHistory([]);
    setTurn(1);
    setIsEndingReached(false);
    setDismissQuotaWarning(false);
    setSelectedChoiceId(null);
    setView("start");
  };

  // Available choices for current scene
  const availableChoices: Choice[] = isEndingReached
    ? []
    : choices.filter((c) => c.scene === currentSceneID);

  // Apply a mutation to page state
  const applyMutation = (mutationId?: string) => {
    if (!mutationId || mutationId === "none") return;
    const mut = mutations.find((m) => m.id === mutationId);
    if (!mut) return;

    setPreviewFlash(true);
    setTimeout(() => setPreviewFlash(false), 500);

    setPageState((prev) => {
      if (mut.reset) {
        return initialPage;
      }
      const nextCart = mut.cart ? { ...prev.cart, ...mut.cart } : prev.cart;
      const nextCancel = mut.cancel ? { ...prev.cancel, ...mut.cancel } : prev.cancel;
      let nextElements = [...prev.elements];

      if (mut.elements) {
        for (const el of mut.elements) {
          if (el.action === "REMOVE") {
            nextElements = nextElements.filter((item) => item.id !== el.id);
          } else if (el.action === "ADD") {
            nextElements = nextElements.filter((item) => item.id !== el.id);
            nextElements.push(el);
          }
        }
      }

      return {
        cart: nextCart,
        cancel: nextCancel,
        elements: nextElements,
      };
    });
  };

  // Execute player reply
  const handleSelectChoice = (choice: Choice) => {
    if (isAiThinking) return;

    // 1. Append user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      kind: "user",
      text: choice.text,
    };
    setHistory((prev) => [...prev, userMsg]);
    setSelectedChoiceId(null);
    setIsAiThinking(true);
    setActiveTools([]);
    setActivePhrase(null);
    setInterimNote(null);
    setStreamingAiText(null);

    // 2. Find resolution
    let res: Resolution | undefined;
    if (choice.resolutions && choice.resolutions.length > 0) {
      res = resolutions.find((r) => choice.resolutions!.includes(r.id));
    }
    if (!res) {
      res = resolutions.find((r) => r.scene === currentSceneID);
    }
    if (!res) {
      res = resolutions[0];
    }

    const matchedRes = res;
    const template = matchedRes.responseTemplates[0];

    // Pick a phrase from family if specified
    let chosenPhrase: string | null = null;
    let chosenInline = "";
    if (template?.phraseSlots && template.phraseSlots.length > 0) {
      const familyName = template.phraseSlots[0].family;
      const family = phraseFamilies.find((f) => f.id === familyName);
      if (family && family.variants.length > 0) {
        const variant = family.variants[Math.floor(Math.random() * family.variants.length)];
        chosenPhrase = variant.reel;
        chosenInline = variant.lead || variant.inline;
      }
    }

    // Step sequence timings
    const toolCount = matchedRes.presentation?.length || 0;
    const thinkingDelay = 800;
    const toolStagger = 600;

    // Simulate tool executions
    if (matchedRes.presentation) {
      matchedRes.presentation.forEach((toolStep, idx) => {
        addTimeout(() => {
          setActiveTools((prev) => [...prev, toolStep]);
        }, thinkingDelay + idx * toolStagger);
      });
    }

    // Show phrase reel
    const phraseDelay = thinkingDelay + toolCount * toolStagger + 400;
    if (chosenPhrase) {
      addTimeout(() => {
        setActivePhrase(chosenPhrase);
      }, phraseDelay);
    }

    // Prepare text template
    let fullText = template?.text || "Done.";
    if (chosenInline) {
      fullText = fullText.replace(/\{phrase\}/g, chosenInline);
    } else {
      fullText = fullText.replace(/\{phrase\}/g, "");
    }

    // Check for interim note: e.g. [[delay:1800|Verifying the button...]]
    const delayMatch = fullText.match(/\[\[delay:(\d+)\|([^\]]+)\]\]/);
    const startStreamingDelay = phraseDelay + (chosenPhrase ? 600 : 200);

    if (delayMatch) {
      const delayMs = parseInt(delayMatch[1], 10);
      const note = delayMatch[2];
      const parts = fullText.split(/\[\[delay:\d+\|[^\]]+\]\]/);
      const firstPart = parts[0].trim();
      const secondPart = parts[1]?.trim() || "";

      // Step 1: Stream first part
      addTimeout(() => {
        streamText(firstPart, () => {
          // Step 2: Show interim note
          setInterimNote(note);
          // Apply mutation right around verification
          applyMutation(matchedRes.mutation);

          // Step 3: Wait delayMs, then stream second part
          addTimeout(() => {
            setInterimNote(null);
            streamText(firstPart + "\n\n" + secondPart, () => {
              finishTurn(matchedRes, firstPart + "\n\n" + secondPart, chosenPhrase);
            });
          }, delayMs);
        });
      }, startStreamingDelay);
    } else {
      addTimeout(() => {
        // Apply mutation
        applyMutation(matchedRes.mutation);
        streamText(fullText, () => {
          finishTurn(matchedRes, fullText, chosenPhrase);
        });
      }, startStreamingDelay);
    }
  };

  const streamText = (targetText: string, onDone: () => void) => {
    let index = 0;
    const chunkLength = 8;
    const interval = 24;

    const intervalId = window.setInterval(() => {
      index += chunkLength;
      if (index >= targetText.length) {
        window.clearInterval(intervalId);
        setStreamingAiText(targetText);
        onDone();
      } else {
        setStreamingAiText(targetText.slice(0, index));
      }
    }, interval);
    timeoutsRef.current.push(intervalId);
  };

  const finishTurn = (res: Resolution, finalMessageText: string, phrase: string | null) => {
    setIsAiThinking(false);
    setStreamingAiText(null);
    setActiveTools([]);
    setActivePhrase(null);
    setInterimNote(null);

    const aiMsg: ChatMessage = {
      id: `ai-${Date.now()}`,
      kind: "ai",
      text: finalMessageText,
      tools: res.presentation,
      phrase: phrase || undefined,
    };
    setHistory((prev) => [...prev, aiMsg]);
    setTurn((prev) => prev + 1);
    setCurrentSceneID(res.nextScene);

    if (res.ending || res.nextScene === "ending") {
      setIsEndingReached(true);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
  };

  // Helper to format button styles safely
  const getButtonStyle = (btn: any): React.CSSProperties => {
    return {
      backgroundColor: btn.bg || "#111111",
      color: btn.fg || "#ffffff",
      border: btn.border || "1px solid #111111",
      borderRadius: btn.radius || "6px",
      padding: btn.padding || "10px 18px",
      fontFamily: btn.fontFamily || "Inter, sans-serif",
      fontSize: btn.fontSize || "15px",
      fontWeight: btn.fontWeight || 500,
      letterSpacing: btn.letterSpacing || "0",
      outline: "none",
      cursor: "pointer",
    };
  };

  return (
    <div className={styles.root}>
      {/* LANDING CARD VIEW */}
      {view === "start" && (
        <main className={styles.landingWrap}>
          <div className={styles.landingCard}>
            <span className={styles.landingBadge}>Parody Experiment · The Button Saga</span>
            <h1 className={styles.landingTitle}>ubiai</h1>
            <div className={styles.landingDesc}>
              <p>Make the “Add to Cart” button blue.</p>
              <p>Do not let the AI assistant change anything else.</p>
            </div>

            <button
              type="button"
              autoFocus
              onClick={handleStartGame}
              className={styles.primaryBtn}
            >
              Let’s go
            </button>

            <button
              type="button"
              onClick={() => setShowAbout(true)}
              className={styles.linkBtn}
            >
              About &amp; Terms
            </button>

            {savedSession && (
              <button
                type="button"
                onClick={handleResumeGame}
                className={styles.resumeBtn}
              >
                Resume previous conversation (Turn {savedSession.turn})
              </button>
            )}
          </div>
        </main>
      )}

      {/* INTERACTIVE SIMULATOR VIEW */}
      {view === "play" && (
        <main className={styles.simContainer}>
          {/* Top Sticky Preview Bar */}
          <header className={styles.previewBar}>
            <div className={styles.previewInner}>
              <div className={styles.previewHeader}>
                <span className={styles.previewHeaderTitle}>
                  <span className={styles.previewDot} />
                  Live Preview · Stage {turn}
                </span>
                <div style={{ display: "flex", gap: "12px" }}>
                  <button
                    type="button"
                    onClick={handleResetBaseline}
                    className={styles.previewResetBtn}
                  >
                    Reset baseline
                  </button>
                  <button
                    type="button"
                    onClick={() => setView("start")}
                    className={styles.previewResetBtn}
                  >
                    Home
                  </button>
                </div>
              </div>

              {/* Surface containing the live buttons */}
              <div className={`${styles.previewSurface} ${previewFlash ? styles.flash : ""}`}>
                {/* Above Elements (e.g. Cookie Consent Banner) */}
                {pageState.elements
                  .filter((el) => el.placement === "ABOVE")
                  .map((el) => (
                    <div
                      key={el.id}
                      className={styles.auxPanel}
                      style={{
                        backgroundColor: el.bg || "#1f2933",
                        color: el.fg || "#ffffff",
                        border: el.border || "1px solid #37474f",
                        padding: el.padding || "12px 14px",
                        fontSize: el.fontSize || "0.72rem",
                      }}
                    >
                      {el.text}
                    </div>
                  ))}

                {/* The Add to Cart and Cancel Buttons */}
                <div className={styles.previewButtonsRow}>
                  {pageState.cart.visible !== false && (
                    <button
                      type="button"
                      className={styles.cartBtn}
                      style={getButtonStyle(pageState.cart)}
                    >
                      {pageState.cart.label || "Add to Cart"}
                    </button>
                  )}
                  {pageState.cancel.visible !== false && (
                    <button
                      type="button"
                      className={styles.cancelBtn}
                      style={getButtonStyle(pageState.cancel)}
                    >
                      {pageState.cancel.label || "Cancel"}
                    </button>
                  )}
                </div>

                {/* Below Elements (e.g. Terms of Use link) */}
                {pageState.elements
                  .filter((el) => el.placement === "BELOW")
                  .map((el) => (
                    <div
                      key={el.id}
                      className={styles.auxText}
                      style={{
                        color: el.fg || "#6b7280",
                        fontSize: el.fontSize || "0.65rem",
                        textAlign: (el.align as any) || "center",
                        textDecoration: "underline",
                        cursor: "pointer",
                      }}
                    >
                      {el.text}
                    </div>
                  ))}
              </div>
            </div>
          </header>

          {/* Chat Feed */}
          <section
            ref={chatScrollRef}
            className={styles.chatScroll}
            aria-label="Interactive Conversation"
          >
            <div className={styles.chatInner}>
              {history.map((msg) => (
                <React.Fragment key={msg.id}>
                  {msg.kind === "user" ? (
                    <div className={styles.userMessage}>{msg.text}</div>
                  ) : (
                    <div className={styles.aiMessageWrap}>
                      <p className={styles.aiSender}>Claude · Assistant</p>

                      {msg.tools && msg.tools.length > 0 && (
                        <div>
                          {msg.tools.map((t, idx) => (
                            <span key={idx} className={styles.toolStepPill}>
                              <span className={styles.toolStepCheck}>✓</span>
                              {t.text}
                            </span>
                          ))}
                        </div>
                      )}

                      {msg.phrase && (
                        <div className={styles.phraseBanner}>{msg.phrase}</div>
                      )}

                      <div className={styles.aiBubble}>
                        {msg.text.split("\n\n").map((p, idx) => (
                          <p key={idx}>{p}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </React.Fragment>
              ))}

              {/* Active AI Turn in Progress */}
              {isAiThinking && (
                <div className={styles.aiMessageWrap}>
                  <p className={styles.aiSender}>Claude · Assistant</p>

                  {/* Thinking dots */}
                  {activeTools.length === 0 && !streamingAiText && (
                    <div className={styles.thinkingIndicator}>
                      <div className={styles.dots}>
                        <span className={styles.dot} />
                        <span className={styles.dot} />
                        <span className={styles.dot} />
                      </div>
                      <span>Analyzing tokens and stylesheets...</span>
                    </div>
                  )}

                  {/* Tools executed so far */}
                  {activeTools.length > 0 && (
                    <div>
                      {activeTools.map((t, idx) => (
                        <span key={idx} className={styles.toolStepPill}>
                          <span className={styles.toolStepCheck}>✓</span>
                          {t.text}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Phrase Banner */}
                  {activePhrase && (
                    <div className={styles.phraseBanner}>{activePhrase}</div>
                  )}

                  {/* Interim status note (e.g. Verifying the button...) */}
                  {interimNote && (
                    <div className={styles.thinkingIndicator}>
                      <div className={styles.dots}>
                        <span className={styles.dot} />
                        <span className={styles.dot} />
                        <span className={styles.dot} />
                      </div>
                      <span>{interimNote}</span>
                    </div>
                  )}

                  {/* Streaming Text Output */}
                  {streamingAiText && (
                    <div className={styles.aiBubble}>
                      {streamingAiText.split("\n\n").map((p, idx) => (
                        <p key={idx}>{p}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Floating Bottom Dock (Choices & Limit Banners) */}
          <footer className={styles.bottomDock}>
            <div className={styles.bottomDockInner}>
              {/* Approaching usage limit warning */}
              {turn >= 10 && !dismissQuotaWarning && !isEndingReached && (
                <div className={styles.statusBanner}>
                  <span>Approaching usage limit for this session</span>
                  <button
                    type="button"
                    onClick={() => setDismissQuotaWarning(true)}
                    className={styles.dismissBtn}
                    aria-label="Dismiss"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Final Climax Reached */}
              {isEndingReached && (
                <div className={styles.statusBanner}>
                  <div>
                    <strong>Usage limit reached</strong> · resets in 6d 2h
                  </div>
                  <button
                    type="button"
                    onClick={handleResetBaseline}
                    className={styles.statusActionBtn}
                  >
                    Try again
                  </button>
                </div>
              )}

              {/* Available Choices */}
              {!isEndingReached && availableChoices.length > 0 && !isAiThinking && (
                <div className={styles.choiceCard}>
                  <p className={styles.choicePrompt}>Select your reply:</p>
                  <div className={styles.choiceList}>
                    {availableChoices.map((choice) => (
                      <button
                        key={choice.id}
                        type="button"
                        onClick={() => setSelectedChoiceId(choice.id)}
                        className={`${styles.choiceBtn} ${
                          selectedChoiceId === choice.id ? styles.selected : ""
                        }`}
                      >
                        {choice.text}
                      </button>
                    ))}
                  </div>
                  <div className={styles.replyActionRow}>
                    <button
                      type="button"
                      disabled={!selectedChoiceId}
                      onClick={() => {
                        const c = availableChoices.find((x) => x.id === selectedChoiceId);
                        if (c) handleSelectChoice(c);
                      }}
                      className={styles.sendReplyBtn}
                    >
                      {history.length === 0 ? "Send" : "Reply"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </footer>
        </main>
      )}

      {/* ABOUT & TERMS MODAL */}
      {showAbout && (
        <div className={styles.modalBackdrop} onClick={() => setShowAbout(false)}>
          <div
            className={styles.modalDialog}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>About &amp; Terms</h2>
              <button
                type="button"
                onClick={() => setShowAbout(false)}
                className={styles.modalClose}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            <section className={styles.modalSection}>
              <h3>What is this?</h3>
              <p>
                A parody game to test your sanity against the insanity of agentic AI assistants.
                A simple request—“Make one button blue. Change nothing else.”—becomes a saga of
                shared design tokens, gradients, color chemistry, and consent architecture.
              </p>
            </section>

            <section className={styles.modalSection}>
              <h3>Who made it?</h3>
              <p>
                Inspired by the viral comedy masterpiece{" "}
                <a
                  href="https://opusfived.dev/"
                  target="_blank"
                  rel="noreferrer"
                  style={{ textDecoration: "underline", color: "inherit" }}
                >
                  opusfived.dev
                </a>{" "}
                by Miloš, integrated into this project as <strong>ubiai</strong>.
              </p>
            </section>

            <section className={styles.modalSection}>
              <h3>Am I talking to a real AI instance?</h3>
              <p>No. The misery is hand-curated.</p>
            </section>

            <section className={styles.modalSection}>
              <h3>Are you affiliated with Anthropic or OpenAI?</h3>
              <p>I wish. But no.</p>
            </section>

            <section className={styles.modalSection}>
              <h3>Legal &amp; Parody</h3>
              <p>
                Work of parody, obviously, no infringement intent, and if you think it’s a good
                idea to sue someone so petty as to make this game, please do.
              </p>
            </section>

            <section className={styles.modalSection}>
              <h3>Privacy</h3>
              <p>
                No tracking or profiling. One essential local storage entry lets you resume
                progress across sessions.
              </p>
            </section>

            <p className={styles.modalCaveat}>One honest caveat, though…</p>
          </div>
        </div>
      )}
    </div>
  );
}

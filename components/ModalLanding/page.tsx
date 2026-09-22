"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import styles from "./modal.module.css";
import { flowNodes, initialNodeId, FlowNode, FlowChoice } from "./flowData";
import { useTheme } from "@/components/ThemeProvider";
import { Sun, Moon, ArrowRight, RotateCcw } from "lucide-react";
import DotMatrixBackground from "./backgrounds/DotMatrixBackground";
import FloatingBadgesBackground from "./backgrounds/FloatingBadgesBackground";

type BackgroundVariant = "dots" | "badges" | "both" | "none";

interface DialogueMessage {
  id: string;
  sender: "ai" | "user";
  text: string;
  referralLink?: {
    label: string;
    url: string;
  };
}

interface PendingAuth {
  type: "google" | "apple" | "general";
  href: string;
}

interface StoredConciergeSession {
  v: number;
  currentNodeId: string;
  history: DialogueMessage[];
  visitedNodeIds: string[];
  stepCount: number;
  updatedAt: number;
}

const MODAL_STORAGE_KEY = "paayh_modal_concierge_session_v1";

export default function ModalLandingPage() {
  const { theme, setTheme } = useTheme();
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isClosing, setIsClosing] = useState<boolean>(false);
  const [currentNodeId, setCurrentNodeId] = useState<string>(initialNodeId);
  const [history, setHistory] = useState<DialogueMessage[]>([]);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);
  const [isAiThinking, setIsAiThinking] = useState<boolean>(false);
  const [pendingAuth, setPendingAuth] = useState<PendingAuth | null>(null);
  const [termsAgreed, setTermsAgreed] = useState<boolean>(false);
  const [isRedirecting, setIsRedirecting] = useState<boolean>(false);
  const [visitedNodeIds, setVisitedNodeIds] = useState<string[]>([initialNodeId]);
  const [stepCount, setStepCount] = useState<number>(1);
  const [savedSession, setSavedSession] = useState<StoredConciergeSession | null>(null);
  const [bgVariant, setBgVariant] = useState<BackgroundVariant>("both");

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<number | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);

  // Dynamic background aesthetic on page load / refresh / reload
  useEffect(() => {
    try {
      // Graceful rotation pool: alternates between Dot Matrix + Crown Badge, Dot Matrix only, and Crown Badge only
      const VARIANTS: BackgroundVariant[] = ["both", "dots", "both", "badges"];
      const lastIndexStr = sessionStorage.getItem("paayh_bg_variant_idx");
      const nextIndex = lastIndexStr
        ? (parseInt(lastIndexStr, 10) + 1) % VARIANTS.length
        : Math.floor(Math.random() * VARIANTS.length);
      sessionStorage.setItem("paayh_bg_variant_idx", nextIndex.toString());
      setBgVariant(VARIANTS[nextIndex]);
    } catch {
      // fallback to default
    }
  }, []);

  // Load saved session on initial mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(MODAL_STORAGE_KEY);
      if (raw) {
        const parsed: StoredConciergeSession = JSON.parse(raw);
        if (
          parsed &&
          parsed.v === 1 &&
          parsed.currentNodeId &&
          Array.isArray(parsed.history) &&
          parsed.history.length > 0
        ) {
          setSavedSession(parsed);
        }
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  // Save session when history or progression changes
  useEffect(() => {
    if (history.length > 1) {
      try {
        const session: StoredConciergeSession = {
          v: 1,
          currentNodeId,
          history,
          visitedNodeIds,
          stepCount,
          updatedAt: Date.now(),
        };
        localStorage.setItem(MODAL_STORAGE_KEY, JSON.stringify(session));
        setSavedSession(session);
      } catch {
        // ignore storage errors
      }
    }
  }, [currentNodeId, history, visitedNodeIds, stepCount]);

  // Initialize dialogue for a brand new conversation
  const initConversation = (nodeId: string = initialNodeId) => {
    const node = flowNodes[nodeId] || flowNodes[initialNodeId];
    setCurrentNodeId(node.id);
    setSelectedChoiceId(null);
    setIsAiThinking(false);
    setPendingAuth(null);
    setTermsAgreed(false);
    setIsRedirecting(false);
    setVisitedNodeIds([node.id]);
    setStepCount(1);
    setHistory([
      {
        id: "ai_init_" + Date.now(),
        sender: "ai",
        text: node.aiMessage,
        referralLink: node.referralLink,
      },
    ]);
  };

  const handleOpenModal = (startingNodeId: string = initialNodeId, resetFirst: boolean = false) => {
    if (resetFirst) {
      try {
        localStorage.removeItem(MODAL_STORAGE_KEY);
      } catch {}
      setSavedSession(null);
      initConversation(startingNodeId);
    } else {
      initConversation(startingNodeId);
    }
    setIsClosing(false);
    setIsModalOpen(true);
  };

  const handleResumeSession = () => {
    if (!savedSession) return;
    setCurrentNodeId(savedSession.currentNodeId);
    setHistory(savedSession.history);
    setVisitedNodeIds(
      Array.isArray(savedSession.visitedNodeIds) && savedSession.visitedNodeIds.length > 0
        ? savedSession.visitedNodeIds
        : [savedSession.currentNodeId]
    );
    setStepCount(savedSession.stepCount || 1);
    setSelectedChoiceId(null);
    setIsAiThinking(false);
    setPendingAuth(null);
    setTermsAgreed(false);
    setIsRedirecting(false);
    setIsClosing(false);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsClosing(true);
    if (closeTimeoutRef.current) {
      window.clearTimeout(closeTimeoutRef.current);
    }
    closeTimeoutRef.current = window.setTimeout(() => {
      setIsModalOpen(false);
      setIsClosing(false);
      setPendingAuth(null);
      setTermsAgreed(false);
      setIsRedirecting(false);
    }, 280);
  };

  const handleResetConversation = () => {
    try {
      localStorage.removeItem(MODAL_STORAGE_KEY);
    } catch {}
    setSavedSession(null);
    initConversation(initialNodeId);
  };

  // Auto scroll chat on history or thinking state changes
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTo({
        top: chatScrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [history, isAiThinking]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      if (closeTimeoutRef.current) window.clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  const currentNode: FlowNode = flowNodes[currentNodeId] || flowNodes[initialNodeId];
  const rawChoices: FlowChoice[] = currentNode.choices || [];

  // Prioritize unvisited questions so topics take time before recycling
  const currentChoices = React.useMemo(() => {
    const actions = rawChoices.filter((c) => c.action);
    const navChoices = rawChoices.filter((c) => !c.action);
    const unvisitedNav = navChoices.filter((c) => !c.nextNodeId || !visitedNodeIds.includes(c.nextNodeId));
    const visitedNav = navChoices.filter((c) => c.nextNodeId && visitedNodeIds.includes(c.nextNodeId));
    return [...unvisitedNav, ...visitedNav, ...actions];
  }, [rawChoices, visitedNodeIds]);

  const handleSendChoice = (choice: FlowChoice) => {
    if (choice.action === "auth_google") {
      setPendingAuth({
        type: "google",
        href: choice.href || "/auth/login?connection=google-oauth2",
      });
      setTermsAgreed(false);
      return;
    }

    if (choice.action === "auth_apple") {
      setPendingAuth({
        type: "apple",
        href: choice.href || "/auth/login?connection=apple",
      });
      setTermsAgreed(false);
      return;
    }

    if (choice.action === "auth_general") {
      setPendingAuth({
        type: "general",
        href: choice.href || "/auth/login",
      });
      setTermsAgreed(false);
      return;
    }

    if (choice.action === "link" && choice.href) {
      window.location.href = choice.href;
      return;
    }

    if (choice.nextNodeId) {
      const targetNodeId = choice.nextNodeId;
      setVisitedNodeIds((prev) => (prev.includes(targetNodeId) ? prev : [...prev, targetNodeId]));
      setStepCount((prev) => prev + 1);

      const targetNode = flowNodes[targetNodeId];

      // Add user selection to dialogue history
      const userMessage: DialogueMessage = {
        id: "user_" + Date.now(),
        sender: "user",
        text: choice.text,
      };

      setHistory((prev) => [...prev, userMessage]);
      setSelectedChoiceId(null);
      setIsAiThinking(true);

      // Brief thinking delay for natural conversational cadence
      timeoutRef.current = window.setTimeout(() => {
        if (targetNode) {
          setCurrentNodeId(targetNode.id);
          const aiReply: DialogueMessage = {
            id: "ai_" + Date.now(),
            sender: "ai",
            text: targetNode.aiMessage,
            referralLink: targetNode.referralLink,
          };
          setHistory((prev) => [...prev, aiReply]);
        }
        setIsAiThinking(false);
      }, 350);
    }
  };

  return (
    <div className={styles.root}>
      {/* Dynamic Interactive Backgrounds: Dot Matrix & Floating Badges */}
      {(bgVariant === "dots" || bgVariant === "both") && <DotMatrixBackground />}
      {(bgVariant === "badges" || bgVariant === "both") && <FloatingBadgesBackground />}

      {/* Background Landing Card View */}
      <main className={styles.landingWrap}>
        <div className={styles.landingCard}>
          <h1 className={styles.landingTitle}>Paayh</h1>

          <div className={styles.landingDesc}>
            {/* <p>Get paid for what AI can't do:</p>
            <p>giving your attention to who needs it.</p> */}
            <p>Monetize your attention!</p>
               {/* <p>Get paid for genuinely paying attention to advert</p> */}

      
          </div>

          {savedSession && savedSession.stepCount >= 1 ? (
            <div className={styles.resumeCard}>
              <div className={styles.resumeHeader}>
                <span className={styles.resumePulseDot} aria-hidden="true" />
                <span className={styles.resumeBadge}>
                  Step {savedSession.stepCount} in progress
                </span>
              </div>
              <div className={styles.resumeBtnGroup}>
                <button
                  type="button"
                  autoFocus
                  onClick={handleResumeSession}
                  className={styles.resumeContinueBtn}
                >
                  <span>Continue journey</span>
                  <ArrowRight size={14} className={styles.resumeBtnIcon} />
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenModal(initialNodeId, true)}
                  className={styles.resumeFreshBtn}
                >
                  <RotateCcw size={12} />
                  <span>Start fresh</span>
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              autoFocus
              onClick={() => handleOpenModal(initialNodeId)}
              className={styles.primaryBtn}
            >
              Let’s go
            </button>
          )}

          <div className={styles.legalLinksRow}>
            
            <Link href="/terms" className={styles.linkBtn}>
              Terms of Service
            </Link>
            <Link href="/privacy" className={styles.linkBtn}>
              Privacy Policy
            </Link>
            <Link href="/cookies" className={styles.linkBtn}>
              Cookie Policy
            </Link>
            <Link href="/about" className={styles.linkBtn}>
              About
            </Link>
          </div>
        </div>
      </main>

      {/* Outside quote and theme switcher fixed at the bottom right of the screen */}
      <div className={styles.floatingBottomRight}>
        <button
          type="button"
          onClick={() => setTheme(theme === "white" ? "dark" : "white")}
          className={styles.themeSwitcherBtn}
          title={theme === "white" ? "Switch to Dark Mode" : "Switch to Light Mode"}
          aria-label="Toggle Theme"
        >
          {theme === "white" ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        <div
          className={`${styles.bottomRightQuote} ${isModalOpen ? styles.quoteHidden : ""}`}
          aria-hidden={isModalOpen}
        >
          &ldquo;AI will take jobs, AI will replace us, AI poses a tremendous level of risk. but AI will not attend your book launch.&rdquo;
        </div>
      </div>

      {/* Interactive Dialogue Modal */}
      {isModalOpen && (
        <div
          className={`${styles.modalBackdrop} ${isClosing ? styles.closing : ""}`}
          onClick={handleCloseModal}
        >
          <div
            className={`${styles.modalDialog} ${isClosing ? styles.closing : ""}`}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Paayh Dialogue Concierge"
          >
            {/* Modal Header */}
            <header className={styles.modalHeader}>
              <div className={styles.modalHeaderLeft}>
                <span className={styles.statusDot} aria-hidden="true" />
                <div className={styles.headerTitles}>
                  <h2 className={styles.modalTitle}>Paayh Concierge</h2>
                  <span className={styles.stepBadge}>
                    Step {stepCount} · {visitedNodeIds.length} explored
                  </span>
                </div>
              </div>
              <div className={styles.modalHeaderActions}>
                <button
                  type="button"
                  onClick={handleResetConversation}
                  className={styles.iconBtn}
                  title="Restart conversation"
                  aria-label="Restart conversation"
                >
                  ↺
                </button>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className={styles.iconBtn}
                  title="Close modal"
                  aria-label="Close modal"
                >
                  ✕
                </button>
              </div>
            </header>

            {/* Chat Body */}
            <div ref={chatScrollRef} className={styles.chatScroll}>
              {history.map((msg) => (
                <React.Fragment key={msg.id}>
                  {msg.sender === "user" ? (
                    <div className={styles.userMessageWrap}>
                      <div className={styles.userBubble}>{msg.text}</div>
                    </div>
                  ) : (
                    <div className={styles.aiMessageWrap}>
                      <span className={styles.aiSender}>Paayh Guide</span>
                      <div className={styles.aiBubble}>
                        <p>{msg.text}</p>
                        {msg.referralLink && (
                          <Link
                            href={msg.referralLink.url}
                            className={styles.referralCard}
                          >
                            <span>{msg.referralLink.label}</span>
                            <span className={styles.referralArrow}>→</span>
                          </Link>
                        )}
                      </div>
                    </div>
                  )}
                </React.Fragment>
              ))}

              {isAiThinking && (
                <div className={styles.thinkingIndicator}>
                  <div className={styles.dots}>
                    <span className={styles.dot} />
                    <span className={styles.dot} />
                    <span className={styles.dot} />
                  </div>
                  <span>Checking Paayh handbook...</span>
                </div>
              )}
            </div>

            {/* Modal Choice Dock (50% Split) */}
            <footer className={styles.modalDock}>
              {pendingAuth ? (
                /* Terms Agreement & Age Verification Step Before Sign In */
                <div className={styles.termsBox}>
                  <div className={styles.termsNotice}>
                    <strong>Age Requirement &amp; Terms Agreement</strong>
                    <span>
                      Paayh is strictly for individuals aged 18 and older. If you continue to sign in and use our service, you confirm that you have read and agree to our terms, or else you should not use Paayh.
                    </span>
                    <div className={styles.termsLegalLinks}>
                      <Link href="/terms" target="_blank" className={styles.termsLegalLink}>
                        Terms of Service
                      </Link>
                      <Link href="/privacy" target="_blank" className={styles.termsLegalLink}>
                        Privacy Policy
                      </Link>
                      <Link href="/cookies" target="_blank" className={styles.termsLegalLink}>
                        Cookie Policy
                      </Link>
                    </div>
                  </div>

                  <label className={styles.termsCheckboxRow}>
                    <input
                      type="checkbox"
                      disabled={isRedirecting}
                      checked={termsAgreed}
                      onChange={(e) => setTermsAgreed(e.target.checked)}
                      className={styles.termsCheckboxInput}
                    />
                    <span className={styles.termsCheckboxText}>
                      I confirm that I am at least 18 years old and I agree to the Terms of Service, Privacy Policy, and Cookie Policy.
                    </span>
                  </label>

                  <div className={styles.termsActionRow}>
                    <button
                      type="button"
                      disabled={isRedirecting}
                      onClick={() => {
                        if (!isRedirecting) {
                          setPendingAuth(null);
                          setIsRedirecting(false);
                        }
                      }}
                      className={`${styles.termsBackBtn} ${isRedirecting ? styles.termsBackBtnDisabled : ""}`}
                    >
                      Back
                    </button>

                    <button
                      type="button"
                      disabled={!termsAgreed || isRedirecting}
                      onClick={() => {
                        if (termsAgreed && pendingAuth?.href && !isRedirecting) {
                          setIsRedirecting(true);
                          window.location.href = pendingAuth.href;
                        }
                      }}
                      className={`${styles.termsSubmitBtn} ${isRedirecting ? styles.termsSubmitBtnLoading : ""}`}
                    >
                      {isRedirecting ? (
                        <>
                          <span className={styles.btnSpinner} aria-hidden="true" />
                          <span>Connecting...</span>
                        </>
                      ) : pendingAuth.type === "google" ? (
                        "Continue with Google"
                      ) : pendingAuth.type === "apple" ? (
                        "Continue with Apple"
                      ) : (
                        "Continue to Sign In"
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                /* Standard Choice Selection */
                <>
                  <p className={styles.choicePrompt}>Select your option:</p>

                  <div className={styles.choiceList}>
                    {currentChoices.map((choice) => {
                      const isSelected = selectedChoiceId === choice.id;
                      return (
                        <button
                          key={choice.id}
                          type="button"
                          disabled={isAiThinking}
                          onClick={() => setSelectedChoiceId(choice.id)}
                          onDoubleClick={() => handleSendChoice(choice)}
                          className={`${styles.choiceBtn} ${isSelected ? styles.selected : ""}`}
                        >
                          <span>{choice.text}</span>
                          <span className={styles.choiceIndicator}>
                            {isSelected && <span className={styles.choiceIndicatorDot} />}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className={styles.replyActionRow}>
                    <button
                      type="button"
                      onClick={handleResetConversation}
                      className={styles.resetTextBtn}
                    >
                      Start over
                    </button>

                    <button
                      type="button"
                      disabled={!selectedChoiceId || isAiThinking}
                      onClick={() => {
                        const choice = currentChoices.find((c) => c.id === selectedChoiceId);
                        if (choice) handleSendChoice(choice);
                      }}
                      className={styles.sendReplyBtn}
                    >
                      Send
                    </button>
                  </div>
                </>
              )}
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

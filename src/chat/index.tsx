import { useCopilotChatInternal } from "@copilotkit/react-core";
import * as React from "react";
import styles from "./style.module.css";

const STORAGE_KEY = "copilotkit-messages";

export function ChatPanel() {
  const { sendMessage, isLoading, messages, setMessages } = useCopilotChatInternal();
  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState("");
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const restoredRef = React.useRef(false);

  // Restore messages from localStorage on mount (AG-UI plain objects)
  React.useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setMessages(parsed);
      }
    } catch {
      // ignore corrupted storage
    }
  }, [setMessages]);

  // Persist messages to localStorage when they change
  React.useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    }
  }, [messages]);

  // AG-UI messages use plain role strings, not class instances
  const textMessages = messages.filter(
    (msg) =>
      (msg.role === "user" || msg.role === "assistant") && typeof msg.content === "string" && msg.content.trim() !== "",
  );

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [textMessages.length]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    sendMessage({ id: crypto.randomUUID(), role: "user", content: text });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={styles.wrapper}>
      <button className={styles.toggle} onClick={() => setOpen((v) => !v)} type="button" aria-label="Toggle chat">
        {open ? "\u2715" : "\u2728"}
      </button>

      {open && (
        <div className={styles.panel}>
          <div className={styles.header}>Gallery Assistant</div>
          <div className={styles.messages}>
            {textMessages.length === 0 && (
              <div className={styles.empty}>
                Ask me to change the gallery — colors, layout, frames, effects...
              </div>
            )}
            {textMessages.map((msg) => (
              <div key={msg.id} className={msg.role === "user" ? styles.userMsg : styles.assistantMsg}>
                {String(msg.content)}
              </div>
            ))}
            {isLoading && (
              <div className={styles.assistantMsg}>
                <span className={styles.dots}>
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div className={styles.inputArea}>
            <textarea
              className={styles.input}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
            />
            <button className={styles.send} onClick={handleSend} disabled={isLoading || !input.trim()} type="button">
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

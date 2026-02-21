import { useCopilotChat } from "@copilotkit/react-core";
import { Role, TextMessage } from "@copilotkit/runtime-client-gql";
import * as React from "react";
import styles from "./style.module.css";

export function ChatPanel() {
  const { visibleMessages, appendMessage, isLoading } = useCopilotChat();
  const [open, setOpen] = React.useState(false);
  const [input, setInput] = React.useState("");
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const textMessages = (visibleMessages ?? [])
    .filter((msg): msg is TextMessage => msg.isTextMessage())
    .filter((msg) => (msg.role === Role.User || msg.role === Role.Assistant) && msg.content.trim());

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [textMessages.length]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    appendMessage(new TextMessage({ content: text, role: Role.User }));
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
              <div key={msg.id} className={msg.role === Role.User ? styles.userMsg : styles.assistantMsg}>
                {msg.content}
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

import { useEffect, useRef, useState } from "react";
import { api, type Message } from "../api";
import { useApi, useOnFocus } from "../hooks";
import { relTime } from "../dates";
import { useSession } from "../session";
import { Icon } from "./Icon";
import { Empty, Spinner, toast } from "./ui";

/** Conversation between a patient and their therapist. */
export function Chat({ patientId, withTabs = true, inline = false }: { patientId?: string; withTabs?: boolean; inline?: boolean }) {
  const { me, refreshUnread } = useSession();
  const path = `/messages${patientId ? `?patientId=${patientId}` : ""}`;
  const { data, loading, reload } = useApi<Message[]>(path);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  useOnFocus(reload);

  useEffect(() => {
    const t = setInterval(reload, 20_000);
    return () => clearInterval(t);
  }, [reload]);

  useEffect(() => {
    if (data) {
      refreshUnread();
      if (!inline) endRef.current?.scrollIntoView({ block: "end" });
    }
  }, [data, refreshUnread, inline]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      await api.post("/messages", { patientId, body });
      setText("");
      await reload();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const composer = (
    <div className="composer-inner">
      <textarea
        rows={1}
        placeholder="Message"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) {
            e.preventDefault();
            send();
          }
        }}
      />
      <button className="icon-btn" style={{ background: "var(--brand)", color: "var(--brand-ink)", width: 44, height: 44, borderRadius: 22 }} onClick={send} disabled={busy} aria-label="Send">
        <Icon name="send" size={20} />
      </button>
    </div>
  );

  return (
    <>
      {loading && !data ? (
        <Spinner />
      ) : !data?.length ? (
        <Empty icon="messages" title="No messages yet">
          {me.role === "patient" ? "Questions about an exercise? Ask here." : "Send a note to check in."}
        </Empty>
      ) : (
        <div className="chat" style={{ paddingBottom: inline ? 12 : 80 }}>
          {data.map((m, i) => {
            const mine = m.sender_id === me.id;
            const showMeta = i === data.length - 1 || data[i + 1].sender_id !== m.sender_id;
            return (
              <div key={m.id} className="chat" style={{ gap: 0 }}>
                <div className={`bubble${mine ? " mine" : ""}`}>{m.body}</div>
                {showMeta && <div className={`bubble-meta${mine ? " mine" : ""}`}>{mine ? "You" : m.sender_name} · {relTime(m.created_at)}</div>}
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      )}
      {inline ? <div style={{ marginTop: 8 }}>{composer}</div> : <div className={`composer${withTabs ? "" : " no-tabs"}`}>{composer}</div>}
    </>
  );
}

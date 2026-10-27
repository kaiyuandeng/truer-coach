import { useSession } from "../../session";
import { Chat } from "../../components/Chat";

export function Messages() {
  const { me } = useSession();
  return (
    <div className="page">
      <h1 style={{ marginBottom: 4 }}>Messages</h1>
      <div className="muted small" style={{ marginBottom: 16 }}>{me.therapist_name ? `With ${me.therapist_name}` : ""}</div>
      <Chat />
    </div>
  );
}

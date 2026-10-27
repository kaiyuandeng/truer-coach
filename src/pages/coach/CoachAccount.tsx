import { useSession } from "../../session";
import { PasswordButton, SignOut } from "../patient/Account";

export function CoachAccount() {
  const { me } = useSession();
  return (
    <div style={{ maxWidth: 560 }}>
      <h1 style={{ marginBottom: 16 }}>Account</h1>
      <div className="list" style={{ marginBottom: 16 }}>
        <div className="list-item">
          <div className="avatar">{me.name[0]}</div>
          <div className="grow">
            <div style={{ fontWeight: 650 }}>{me.name}</div>
            <div className="small muted">{me.email}</div>
          </div>
        </div>
        <PasswordButton />
      </div>
      <SignOut />
    </div>
  );
}

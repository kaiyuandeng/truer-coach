import { NavLink, Outlet } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { useSession } from "../../session";
import { TabBar } from "../patient/Shell";

export function CoachShell() {
  const { me, unread } = useSession();
  const links = [
    { to: "/", label: "Overview", icon: "home" },
    { to: "/inbox", label: "Inbox", icon: "inbox", badge: unread },
    { to: "/clients", label: "Clients", icon: "users" },
    { to: "/library", label: "Workouts", icon: "library" },
    { to: "/exercises", label: "Exercises", icon: "dumbbell" },
    { to: "/courses", label: "Store", icon: "store" },
    { to: "/account", label: "Account", icon: "account" },
  ];
  return (
    <div className="coach-shell">
      <nav className="sidenav" aria-label="Main">
        <div className="brand-mark">
          <span className="logo"><Icon name="check" /></span>
          <span className="word">Rehab<b>Loop</b></span>
        </div>
        {links.filter((l) => l.to !== "/account").map((l) => (
          <NavLink key={l.to} to={l.to} end={l.to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
            <Icon name={l.icon} /> <span className="grow">{l.label}</span>
            {!!l.badge && <span className="chip danger" style={{ padding: "0 7px" }}>{l.badge}</span>}
          </NavLink>
        ))}
        <NavLink to="/account" className="sidenav-foot" title="Account">
          <div className="avatar">{me.name[0]}</div>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="small ellipsis" style={{ fontWeight: 650, color: "var(--text)" }}>{me.name}</div>
            <div className="tiny faint">Coach</div>
          </div>
        </NavLink>
      </nav>
      <main className="coach-main">
        <div className="inner">
          <Outlet />
        </div>
      </main>
      <div className="coach-tabbar">
        <TabBar tabs={links.filter((l) => l.to !== "/account")} />
      </div>
    </div>
  );
}

import { NavLink, Outlet } from "react-router-dom";
import { Icon } from "../../components/Icon";
import { useSession } from "../../session";

export function TabBar({ tabs }: { tabs: { to: string; label: string; icon: string; badge?: number }[] }) {
  return (
    <nav className="tabbar" aria-label="Main">
      <div className="tabbar-inner">
        {tabs.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === "/"} className={({ isActive }) => `tab${isActive ? " active" : ""}`}>
            <Icon name={t.icon} />
            {t.label}
            {!!t.badge && <span className="badge">{t.badge}</span>}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export function PatientShell() {
  const { unread } = useSession();
  return (
    <div className="app">
      <Outlet />
      <TabBar
        tabs={[
          { to: "/", label: "Workouts", icon: "workouts" },
          { to: "/shop", label: "Courses", icon: "bag" },
          { to: "/messages", label: "Messages", icon: "messages", badge: unread },
          { to: "/account", label: "Account", icon: "account" },
        ]}
      />
    </div>
  );
}

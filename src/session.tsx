import { createContext, useContext } from "react";
import type { Me } from "./api";

export type Session = { me: Me; refresh: () => Promise<void>; unread: number; refreshUnread: () => void };
export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error("No session");
  return s;
}

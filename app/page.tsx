import Carpool from "./carpool";
import { authConfig } from "../lib/auth-config";
export const dynamic = "force-dynamic";
export default function Home() {
  return (
    <Carpool
      initialMode={authConfig().mode === "standalone" ? "live" : "demo"}
    />
  );
}

import { LogOut } from "lucide-react";
import { buttonSecondary } from "@/components/ui/styles";

export function LogoutButton() {
  return (
    <form action="/auth/logg-ut" method="post">
      <button className={buttonSecondary}>
        <LogOut size={20} aria-hidden />
        Logg ut
      </button>
    </form>
  );
}

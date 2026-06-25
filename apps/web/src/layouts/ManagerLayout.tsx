import { ReactNode, useState } from "react";
import { FloatingDock } from "../components/ui/floating-dock";
import {
  IconCalendarEvent,
  IconCoin,
  IconLayoutDashboard,
  IconTerminal2,
  IconLogout,
} from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { clearAuth } from "../lib/auth";

export default function ManagerLayout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const handleLogout = () => {
    clearAuth();
    navigate('/login', { replace: true });
  };

  const links = [
    {
      title: "Dashboard",
      icon: (
        <IconLayoutDashboard className="h-full w-full text-neutral-500 dark:text-neutral-300" />
      ),
      href: "/manager/dashboard",
    },
    {
      title: "Operations",
      icon: (
        <IconTerminal2 className="h-full w-full text-neutral-500 dark:text-neutral-300" />
      ),
      href: "/manager/operations",
    },
    {
      title: "Payments",
      icon: (
        <IconCoin className="h-full w-full text-neutral-500 dark:text-neutral-300" />
      ),
      href: "/manager/payments",
    },
    {
      title: "Reservations",
      icon: (
        <IconCalendarEvent className="h-full w-full text-neutral-500 dark:text-neutral-300" />
      ),
      href: "/manager/reservations",
    },
    {
      title: "Logout",
      icon: (
        <IconLogout className="h-full w-full text-rose-500 dark:text-rose-400" />
      ),
      href: "#",
      onClick: (e: React.MouseEvent) => {
        e.preventDefault();
        setShowLogoutModal(true);
      }
    },
  ];

  return (
    <div className="relative min-h-screen bg-slate-100 dark:bg-slate-950 pb-24 transition-colors duration-300">

      <div className="relative z-0">
        {children}
      </div>
      <div className="fixed bottom-6 inset-x-0 z-50 flex items-center justify-center">
        <FloatingDock items={links} />
      </div>

      {showLogoutModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-2xl ring-1 ring-slate-200 dark:ring-white/10">
            <h3 className="text-lg font-black text-slate-950 dark:text-white">Confirm Logout</h3>
            <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-400">
              Are you sure you want to sign out of the manager console?
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setShowLogoutModal(false)}
                className="rounded-xl px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500/20 transition"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { signOut } from "@/app/actions";
import { displayName, getSession } from "@/lib/data/session";

const NAV = [
  { href: "/", label: "Feed" },
  { href: "/calendar", label: "Calendar" },
  { href: "/people", label: "People" },
  { href: "/import", label: "Add" },
  { href: "/agent", label: "Agent" },
];

export async function SiteHeader() {
  const session = await getSession();

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
          <span className="pulse-dot inline-block h-2.5 w-2.5 rounded-full bg-accent" aria-hidden />
          <span>
            UniPulse <span className="text-accent">HK</span>
          </span>
        </Link>

        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-sm">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-3 py-1.5 text-muted transition-colors hover:bg-surface hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {session ? (
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/profile/me"
              className="flex items-center gap-2 rounded-full border border-line bg-surface py-1 pl-1 pr-3 text-sm hover:border-ink"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">
                {displayName(session.profile, session.email).charAt(0).toUpperCase()}
              </span>
              <span className="hidden max-w-32 truncate sm:inline">
                {displayName(session.profile, "Profile")}
              </span>
            </Link>
            <form action={signOut}>
              <button type="submit" className="px-2 text-sm text-muted hover:text-ink">
                Sign out
              </button>
            </form>
          </div>
        ) : (
          <Link href="/login" className="btn btn-dark shrink-0">
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}

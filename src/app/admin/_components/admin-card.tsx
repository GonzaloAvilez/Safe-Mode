// The "rounded-lg border ... bg-white/[0.04]" panel shape repeated 7 times across
// phrases/flagged/metrics/spend (list items and stat blocks alike) — introduced
// alongside the layered-dark background pass so cards actually read as raised above
// the page instead of blending into one flat black plane. `as` picks the host
// element since callers need `<li>` inside a `<ul>` as often as `<div>`.
// login-form.tsx's card-styled <form> is deliberately not folded in here — it's the
// only form-as-card in the codebase, not a repeated shape, and forcing it through
// this component would mean threading `action`/`onSubmit` for one caller.
type AdminCardProps = {
  as?: "div" | "li";
  tone?: "neutral" | "danger" | "warning";
  className?: string;
  children: React.ReactNode;
};

const TONE_BORDERS: Record<NonNullable<AdminCardProps["tone"]>, string> = {
  neutral: "border-white/10",
  danger: "border-red-500/20",
  warning: "border-amber-500/20",
};

export function AdminCard({ as: Tag = "div", tone = "neutral", className = "", children }: AdminCardProps) {
  return <Tag className={`rounded-lg border ${TONE_BORDERS[tone]} bg-white/[0.04] ${className}`}>{children}</Tag>;
}

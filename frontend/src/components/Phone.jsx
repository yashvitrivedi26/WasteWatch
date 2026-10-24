// The dark "phone" frame used in the original WasteWatch demo.
export default function Phone({ who, title, children }) {
  return (
    <aside className="phone">
      <div className="hd">{who}<b>{title}</b></div>
      <div className="scr">{children}</div>
    </aside>
  );
}

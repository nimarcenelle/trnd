export default function AppLoading() {
  return (
    <div className="wrap py-[44px] px-8">
      <div className="skeleton h-[14px] w-[220px] mb-[18px]" />
      <div className="skeleton" style={{ height: 240, borderRadius: "var(--radius-card)", marginBottom: 24 }} />
      <div className="grid grid-cols-[repeat(auto-fill,_minmax(250px,_1fr))] gap-[14px]">
        <div className="skeleton h-[90px]" />
        <div className="skeleton h-[90px]" />
        <div className="skeleton h-[90px]" />
      </div>
    </div>
  );
}

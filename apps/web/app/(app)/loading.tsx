export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="skel" />
      <div className="skel" />
      <div className="skel" />
    </div>
  );
}

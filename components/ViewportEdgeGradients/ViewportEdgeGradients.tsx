export function ViewportEdgeGradients({
  topVisible,
  bottomVisible,
}: {
  topVisible: boolean;
  bottomVisible: boolean;
}) {
  return (
    <div
      className="ViewportEdgeGradients"
      data-top-visible={topVisible}
      data-bottom-visible={bottomVisible}
      aria-hidden="true"
    >
      <div className="ViewportEdgeGradient ViewportEdgeGradient--top" />
      <div className="ViewportEdgeGradient ViewportEdgeGradient--bottom" />
    </div>
  );
}

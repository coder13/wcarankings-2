export function FeedLoadingSkeletons() {
  return (
    <div className="feedLoadingSkeletons" aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => (
        <div className="feedLoadingSkeleton" key={index}>
          <div className="feedLoadingLabel" />
          <div className="feedLoadingCard">
            <div className="feedLoadingHeading">
              <div className="feedLoadingAction" />
            </div>
            <div className="feedLoadingRows">
              {Array.from({ length: 5 }, (_, row) => (
                <div className="feedLoadingRow" key={row} />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

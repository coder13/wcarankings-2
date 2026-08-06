export function FeedLoadingSkeleton() {
  return (
    <div className="feedLoadingSkeleton" aria-hidden="true">
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
  );
}

export function FeedLoadingSkeletons() {
  return (
    <div className="feedLoadingSkeletons">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index}>
          <FeedLoadingSkeleton />
        </div>
      ))}
    </div>
  );
}

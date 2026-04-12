export default function MenuLoading() {
  return (
    <>
      <h2 className="section-title">Full menu view</h2>

      <section className="menu-date-card">
        <div className="menu-nav">
          <div className="menu-nav-button menu-nav-button-skeleton skeleton-block" />
          <div className="menu-date-title-centered skeleton-block skeleton-title" />
          <div className="menu-nav-button menu-nav-button-skeleton skeleton-block" />
        </div>

        <div className="pill-row">
          <div className="pill-link button-reset skeleton-block skeleton-pill" />
          <div className="pill-link button-reset skeleton-block skeleton-pill" />
          <div className="pill-link button-reset skeleton-block skeleton-pill" />
        </div>

        <div className="menu-station-stack">
          {[0, 1, 2].map((index) => (
            <div key={index} className="menu-station-details">
              <div className="menu-station-summary">
                <div className="skeleton-block skeleton-station-title" />
                <div className="skeleton-block skeleton-chevron" />
              </div>
              <div className="menu-card-grid">
                {[0, 1, 2].map((cardIndex) => (
                  <div key={cardIndex} className="menu-item-card">
                    <div className="skeleton-block skeleton-item-name" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

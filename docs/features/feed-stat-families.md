# Feed statistic families

The feed inventory includes person rankings, result rankings, person
competition-count rankings, person medal rankings, competition rankings, and
city rankings.

The visible name `Person rankings` means personal-best rankings. The visible
name `Person result rankings` means rankings of all results. These names must
stay distinct in feed titles and stat labels.

The feed supports Everyone, Female, and Other variants. It does not create or
display Men variants.

All feed candidates still come from results or competitions in the recent
seven-day window. The inventory keeps current-year and all-time variants. It
does not create prior-year variants.

One interesting result creates one feed item. At request time, the feed sorts
candidate stats by the current runtime notability and popularity values, then
keeps the most notable stat for that result.

Competition and city adapters reuse their existing ranking services. Person
competition-count and medal adapters reuse their existing ranking services.

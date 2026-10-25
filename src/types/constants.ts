export const NovelStatus = {
  Unknown: 'Unknown',
  Ongoing: 'Ongoing',
  Completed: 'Completed',
  Licensed: 'Licensed',
  PublishingFinished: 'Publishing Finished',
  Cancelled: 'Cancelled',
  OnHiatus: 'On Hiatus',
} as const;

export const defaultCover =
  'https://raw.githubusercontent.com/tinywind/norea-plugins/0.2/public/static/coverNotAvailable.webp';

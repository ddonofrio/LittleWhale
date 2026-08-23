/** Durable settings namespace for product-wide GUI onboarding facts. */
export const WELCOME_NOTICE_SETTINGS_NAMESPACE = 'ui-onboarding'

/** Field storing the last welcome notice version the user acknowledged. */
export const WELCOME_NOTICE_ACK_FIELD = 'welcomeNoticeVersion'

/**
 * Bump only when the notice changes materially and every user should see it
 * again. The acknowledgement is compared for exact equality.
 */
export const WELCOME_NOTICE_VERSION = '2026-08-13.1'

/** The complete Little Whale first-run notice. Both keys stay for upstream API compatibility. */
export const WELCOME_NOTICE_COPY = {
  zh: {
    title: 'Welcome to Little Whale',
    body: 'Little Whale is a local-model-first coding agent. Connect an OpenAI-compatible model server on your machine or network to begin.',
    continueLabel: 'Continue',
  },
  en: {
    title: 'Welcome to Little Whale',
    body: 'Little Whale is a local-model-first coding agent. Connect an OpenAI-compatible model server on your machine or network to begin.',
    continueLabel: 'Continue',
  },
} as const

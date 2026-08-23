# @little-whale/ui-brand

Little Whale branding occupants for the web client's brand slots. The browser half provides the Little Whale hero, sidebar identity, favicon, and related product marks through the shared UI slot system.

## Configuration

Load the package in the Web composition with its `./client` entry. It requires the client runtime, conversation UI, sidebar UI, Cordis, and invariant packages declared by the package manifest.

## Model Experience

### Visual brand only

#### What the model sees

The package contributes no model-visible content; the brand is rendered in the client UI outside model context.

#### Token effect

`0` tokens are added to model requests.

#### KV Cache effect

`0` cached tokens are added by this package.

## Known Limitations and Deferred Work

- New brand surfaces should reuse the registered Little Whale slots and assets rather than adding a second branding path.

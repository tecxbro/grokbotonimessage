import { app, edit, type ContentBuilder, type Message, type Space } from 'spectrum-ts';
import { customizedMiniApp, imessage } from 'spectrum-ts/providers/imessage';
import { sameScope, type ExecutionServices } from '../../index.js';
import { approvedUrl, requireCard, type CardLayout, type CardOptions, type CardTemplate } from './configuration.js';

export function checkSpace(space: Space, services: ExecutionServices, options: CardOptions): void {
  const binding = options.binding(services.context);
  requireCard(sameScope(binding.scope, services.context.scope), 'SCOPE_MISMATCH', 'Host card binding has a different scope.');
  requireCard(space.__platform === 'imessage', 'UNSUPPORTED', 'Native cards require cloud iMessage.');
  requireCard(space.id === binding.nativeSpaceId && imessage(space).phone === binding.phone,
    'SCOPE_MISMATCH', 'Card conversation or serving line differs from the trusted binding.');
}
export function checkMessage(message: Message, s: ExecutionServices, options: CardOptions): void {
  requireCard(message.platform === 'imessage' && message.direction === 'outbound', 'FORBIDDEN', 'An original outbound cloud iMessage card is required.');
  checkSpace(message.space, s, options);
}
export async function cardContent(template: CardTemplate, url: string, layout: CardLayout | undefined, s: ExecutionServices): Promise<ContentBuilder> {
  approvedUrl(template, url);
  if (template.kind === 'universal') {
    requireCard(!layout, 'UNAVAILABLE', 'The public universal builder accepts a URL, not a layout.', 'universal_update_url_required');
    return app(url, { live: !!template.live });
  }
  requireCard(template.extension, 'UNAVAILABLE', 'Customized extension is not configured.', 'customized_extension_missing');
  const image = layout?.image ? await s.media.resolve(layout.image, s.context) : undefined;
  if (image) requireCard(image.bytes.byteLength > 0 && image.bytes.byteLength <= 25 * 1024 * 1024 && image.mimeType.startsWith('image/'),
    'MEDIA_REJECTED', 'Card image must be bounded staged image media.');
  if (image) requireCard(layout?.caption, 'INVALID_REQUEST', 'An image card needs a nonempty caption for its required image title.');
  return customizedMiniApp({ ...template.extension, url, live: !!template.live,
    layout: { caption: layout?.caption, subcaption: layout?.subcaption,
      image: image ? new Uint8Array(image.bytes) : undefined, imageTitle: image ? layout?.caption : undefined } });
}
/** Resolve builders before the final fence check. No provider/client is instantiated. */
export async function preparedSend(builder: ContentBuilder): Promise<ContentBuilder> {
  const content = await builder.build();
  return { build: async () => content };
}
export async function preparedEdit(builder: ContentBuilder, target: Message): Promise<ContentBuilder> {
  return preparedSend(edit(builder, target));
}

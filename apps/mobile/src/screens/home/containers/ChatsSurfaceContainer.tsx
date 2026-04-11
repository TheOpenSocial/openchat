import type { ComponentProps } from "react";

import { ChatsListScreen } from "../../ChatsListScreen";

type ChatsSurfaceContainerProps = ComponentProps<typeof ChatsListScreen>;

export function ChatsSurfaceContainer(props: ChatsSurfaceContainerProps) {
  return <ChatsListScreen {...props} />;
}

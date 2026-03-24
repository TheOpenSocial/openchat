import type { ComponentProps } from "react";

import { OpenChatScreen } from "../open-chat/OpenChatScreen";

type HomeAgentThreadScreenProps = ComponentProps<typeof OpenChatScreen>;

export function HomeAgentThreadScreen(props: HomeAgentThreadScreenProps) {
  return <OpenChatScreen {...props} />;
}

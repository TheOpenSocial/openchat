import type { ComponentProps } from "react";

import { HomeAgentThreadScreen } from "../../HomeAgentThreadScreen";

type HomeSurfaceContainerProps = ComponentProps<typeof HomeAgentThreadScreen>;

export function HomeSurfaceContainer(props: HomeSurfaceContainerProps) {
  return <HomeAgentThreadScreen {...props} />;
}

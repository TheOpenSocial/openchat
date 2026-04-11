import type { ComponentProps } from "react";

import { ActivityScreen } from "../../ActivityScreen";

type ActivitySurfaceContainerProps = ComponentProps<typeof ActivityScreen>;

export function ActivitySurfaceContainer(props: ActivitySurfaceContainerProps) {
  return <ActivityScreen {...props} />;
}

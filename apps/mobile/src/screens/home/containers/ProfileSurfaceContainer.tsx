import type { ComponentProps } from "react";

import { ProfileScreen } from "../../ProfileScreen";

type ProfileSurfaceContainerProps = ComponentProps<typeof ProfileScreen>;

export function ProfileSurfaceContainer(props: ProfileSurfaceContainerProps) {
  return <ProfileScreen {...props} />;
}

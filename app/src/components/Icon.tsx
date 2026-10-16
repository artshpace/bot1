import Svg, { Circle, Path, Rect } from "react-native-svg";
import { C } from "../theme";

// Иконки сайта (тот же SVG-спрайт), отрисованные через react-native-svg.
export type IconName =
  | "home" | "cal" | "plus" | "price" | "more" | "person" | "image" | "info" | "help"
  | "doc" | "lock" | "check" | "chat" | "pin" | "cam" | "play" | "chev" | "chevd"
  | "left" | "laptop" | "mail" | "wa" | "star" | "trophy" | "flame" | "spark"
  | "d-guitar" | "d-acting" | "d-vocals" | "d-dance" | "d-painting";

type Props = { name: IconName | string; size?: number; color?: string; strokeWidth?: number };

export function Icon({ name, size = 22, color = C.text, strokeWidth = 1.7 }: Props) {
  const s = { stroke: color, strokeWidth, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const f = { fill: color, stroke: "none" };
  let body: React.ReactNode;
  switch (name) {
    case "home": body = <><Path d="M3 11l9-8 9 8" {...s} /><Path d="M5 10v9a1 1 0 0 0 1 1h3v-6h6v6h3a1 1 0 0 0 1-1v-9" {...s} /></>; break;
    case "cal": body = <><Rect x="3" y="5" width="18" height="16" rx="2" {...s} /><Path d="M3 9h18M8 3v4M16 3v4" {...s} /></>; break;
    case "plus": body = <Path d="M12 5v14M5 12h14" {...s} />; break;
    case "price": body = <><Path d="M20 12l-8 8-9-9V4h7z" {...s} /><Circle cx="7.5" cy="7.5" r="1.4" {...f} /></>; break;
    case "more": body = <><Circle cx="5" cy="12" r="1.6" {...f} /><Circle cx="12" cy="12" r="1.6" {...f} /><Circle cx="19" cy="12" r="1.6" {...f} /></>; break;
    case "person": body = <><Circle cx="12" cy="8" r="4" {...s} /><Path d="M4 21c0-4 4-6 8-6s8 2 8 6" {...s} /></>; break;
    case "image": body = <><Rect x="3" y="4" width="18" height="16" rx="2" {...s} /><Circle cx="8.5" cy="9.5" r="1.6" {...s} /><Path d="M21 16l-5-5L5 20" {...s} /></>; break;
    case "info": body = <><Circle cx="12" cy="12" r="9" {...s} /><Path d="M12 11v5M12 8h.01" {...s} /></>; break;
    case "help": body = <><Circle cx="12" cy="12" r="9" {...s} /><Path d="M9.5 9.5a2.5 2.5 0 0 1 4.5 1.5c0 1.5-2 2-2 3M12 16.5h.01" {...s} /></>; break;
    case "doc": body = <><Path d="M6 2h8l4 4v16H6z" {...s} /><Path d="M14 2v4h4M9 12h6M9 16h6M9 8h2" {...s} /></>; break;
    case "lock": body = <><Rect x="5" y="11" width="14" height="9" rx="2" {...s} /><Path d="M8 11V8a4 4 0 0 1 8 0v3" {...s} /></>; break;
    case "check": body = <Path d="M5 12l5 5 9-11" {...s} />; break;
    case "chat": body = <Path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-5A8 8 0 1 1 21 12z" {...s} />; break;
    case "pin": body = <><Path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z" {...s} /><Circle cx="12" cy="10" r="2.4" {...s} /></>; break;
    case "cam": body = <><Rect x="3" y="7" width="18" height="13" rx="2" {...s} /><Path d="M8 7l1.5-2h5L16 7" {...s} /><Circle cx="12" cy="13.5" r="3" {...s} /></>; break;
    case "play": body = <Path d="M8 5l11 7-11 7z" {...f} />; break;
    case "chev": body = <Path d="M9 6l6 6-6 6" {...s} />; break;
    case "chevd": body = <Path d="M6 9l6 6 6-6" {...s} />; break;
    case "left": body = <Path d="M15 6l-6 6 6 6" {...s} />; break;
    case "laptop": body = <><Rect x="4" y="5" width="16" height="11" rx="1.5" {...s} /><Path d="M2 20h20" {...s} /></>; break;
    case "mail": body = <><Rect x="3" y="5" width="18" height="14" rx="2" {...s} /><Path d="M3 7.5l9 6 9-6" {...s} /></>; break;
    case "wa": body = <><Path d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.6-1.2A9 9 0 1 0 12 3z" {...s} /><Path d="M8.6 8.4c.2-.4.4-.4.6-.4h.5c.2 0 .4 0 .6.4l.7 1.6c.1.2.1.3 0 .5l-.5.7c-.1.2-.2.3 0 .5.6 1 1.4 1.6 2.4 2 .2.1.3.1.5-.1l.6-.7c.2-.2.3-.2.5-.1l1.6.8c.2.1.3.2.3.4 0 .5-.2 1.2-.5 1.4-.3.2-1 .5-1.6.4-1.8-.3-3.4-1.2-4.6-2.6-.8-.9-1.4-2-1.5-2.8-.1-.6.1-1.2.4-1.7z" {...s} /></>; break;
    case "star": body = <Path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" {...s} />; break;
    case "trophy": body = <><Path d="M7 4h10v5a5 5 0 0 1-10 0z" {...s} /><Path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8M9 18h6" {...s} /></>; break;
    case "flame": body = <Path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5z" {...s} />; break;
    case "spark": body = <Path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" {...s} />; break;
    case "d-guitar": body = <>
      <Rect x="13.2" y="2.2" width="2.6" height="3" rx="0.6" transform="rotate(45 14.5 3.7)" fill={C.black} />
      <Rect x="12.7" y="4" width="2.4" height="12" rx="1" transform="rotate(45 13.9 10)" fill={C.black} />
      <Circle cx="8.6" cy="15.4" r="5.4" fill={C.gold} />
      <Circle cx="8.6" cy="15.4" r="1.9" fill={C.red} />
    </>; break;
    case "d-acting": body = <>
      <Path d="M3.5 4.5h7.5v4.8a3.75 3.75 0 0 1-7.5 0z" fill={C.red} />
      <Circle cx="5.6" cy="7" r="0.8" fill="#fff" /><Circle cx="8.8" cy="7" r="0.8" fill="#fff" />
      <Path d="M13 9.2h7.5v4.8a3.75 3.75 0 0 1-7.5 0z" fill={C.gold} />
      <Circle cx="15.2" cy="11.7" r="0.8" fill={C.black} /><Circle cx="18.4" cy="11.7" r="0.8" fill={C.black} />
    </>; break;
    case "d-vocals": body = <>
      <Rect x="9" y="3" width="6" height="11" rx="3" fill={C.black} />
      <Circle cx="12" cy="7" r="1.3" fill={C.red} />
      <Path d="M6 11a6 6 0 0 0 12 0" fill="none" stroke={C.gold} strokeWidth={1.8} strokeLinecap="round" />
      <Rect x="11.1" y="17" width="1.8" height="4" fill={C.black} />
      <Rect x="8.5" y="20.4" width="7" height="1.9" rx="0.9" fill={C.black} />
    </>; break;
    case "d-dance": body = <>
      <Circle cx="13" cy="4.4" r="2.1" fill={C.red} />
      <Path d="M13 6.8l-2 5.2 4 2-1 5" fill="none" stroke={C.black} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M11 12l-4 1.2M15 9.2l4 1.8" fill="none" stroke={C.gold} strokeWidth={1.9} strokeLinecap="round" />
    </>; break;
    case "d-painting": body = <>
      <Path d="M11 3a8 7 0 1 0 1.5 13.9c1-.1 1.3-1 1-1.9-.4-1.2.4-2.2 1.6-2.2H17a3.5 3.5 0 0 0 3.5-3.7C20.2 5.7 16 3 11 3z" fill={C.gold} />
      <Circle cx="7.4" cy="9" r="1.1" fill={C.red} />
      <Circle cx="6.8" cy="12.6" r="1.1" fill={C.black} />
      <Circle cx="9.8" cy="6.6" r="1.1" fill={C.green} />
      <Circle cx="13.4" cy="6.6" r="1.1" fill="#3A6EA5" />
    </>; break;
    default: body = <Circle cx="12" cy="12" r="8" {...s} />;
  }
  return <Svg width={size} height={size} viewBox="0 0 24 24">{body}</Svg>;
}

import {
  Beaker,
  BookOpen,
  Bug,
  CircleDot,
  FileText,
  Flag,
  GraduationCap,
  Heart,
  Layers,
  Lightbulb,
  Package,
  PenLine,
  Rocket,
  Search,
  Shield,
  Sparkles,
  SquareCheckBig,
  Star,
  Wrench,
  Zap,
} from "lucide-react";

// RFC 0002: the curated, append-only allow-list of lucide identifiers shared
// with the API-side validation constant. Entries are only ever appended,
// never renamed or removed, because existing attribute rows reference them.
const taskAttributeIcons = {
  SquareCheckBig,
  Bug,
  FileText,
  CircleDot,
  Lightbulb,
  Wrench,
  BookOpen,
  Rocket,
  Shield,
  Star,
  Zap,
  Beaker,
  Flag,
  Heart,
  Sparkles,
  Layers,
  Package,
  Search,
  PenLine,
  GraduationCap,
} as const;

export type TaskAttributeIconName = keyof typeof taskAttributeIcons;

export default taskAttributeIcons;

import Masthead from '@/components/Masthead';

/**
 * Public chrome. Everything a reader sees sits inside this group;
 * the admin desk has its own shell and never loads this masthead.
 */
export default function SiteLayout({ children }) {
  return <Masthead>{children}</Masthead>;
}

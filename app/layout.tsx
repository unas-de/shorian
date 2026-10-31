import './globals.css';
export const metadata={title:'شُريان | مساحة عيادتك',description:'إدارة يوم العيادة، ببساطة'};
export default function Layout({children}:{children:React.ReactNode}){
  // Browser recorders such as Scribe may add attributes to <html> before hydration.
  // Limit suppression to this element; React still checks the application below it.
  return <html lang="ar" dir="rtl" suppressHydrationWarning><body>{children}</body></html>
}

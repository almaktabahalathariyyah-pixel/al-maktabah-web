'use client';

import { useState } from 'react';
import { UserPlus, LogIn } from 'lucide-react';
import styles from './page.module.css';

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);

  const toggleMode = () => setIsLogin(!isLogin);

  return (
    <div className={styles.loginContainer}>
      <div className={styles.loginCard}>
        
        <div className={styles.header}>
          <div className={styles.iconWrapper}>
            {isLogin ? <LogIn size={32} color="var(--accent-primary)" /> : <UserPlus size={32} color="var(--accent-primary)" />}
          </div>
          <h1>{isLogin ? 'Welcome Back' : 'Create an Account'}</h1>
          <p>{isLogin ? 'Sign in to access your library and saved books.' : 'Join to download restricted books and more.'}</p>
        </div>

        <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
          {!isLogin && (
            <div className={styles.inputGroup}>
              <label htmlFor="name">Full Name</label>
              <input type="text" id="name" placeholder="John Doe" />
            </div>
          )}
          
          <div className={styles.inputGroup}>
            <label htmlFor="email">Email Address</label>
            <input type="email" id="email" placeholder="you@example.com" />
          </div>

          <div className={styles.inputGroup}>
            <label htmlFor="password">Password</label>
            <input type="password" id="password" placeholder="••••••••" />
          </div>

          {!isLogin && (
            <div className={styles.inputGroup}>
              <label htmlFor="socialLink">Social Link for Verification</label>
              <input type="text" id="socialLink" placeholder="Facebook / IG / LINE Profile URL" />
              <p style={{fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '0.25rem'}}>
                Required by admin to verify your identity.
              </p>
            </div>
          )}

          <button type="submit" className={styles.submitBtn}>
            {isLogin ? 'Sign In' : 'Register & Request Access'}
          </button>
        </form>

        <div className={styles.divider}>or continue with</div>

        <button className={styles.googleBtn}>
          <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Google
        </button>

        <div className={styles.footer}>
          {isLogin ? "Don't have an account?" : "Already have an account?"}
          <button onClick={toggleMode} className={styles.toggleAuthBtn}>
            {isLogin ? 'Sign up' : 'Log in'}
          </button>
        </div>

      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import styles from './page.module.css';

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);

  return (
    <div className="container">
      <div className={`${styles.wrap} rise`}>
        <header className={styles.header}>
          <p className="eyebrow">{isLogin ? 'Members' : 'Register'}</p>
          <h1 className={styles.title}>
            {isLogin ? 'Sign in' : 'Request an account'}
          </h1>
          <p className={styles.sub}>
            {isLogin
              ? 'Return to your shelf and the titles released to you.'
              : 'Registration is open. Access to restricted titles is granted by the owner, one reader at a time.'}
          </p>
        </header>

        <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
          {!isLogin && (
            <div className={styles.field}>
              <label htmlFor="name">Full name</label>
              <input id="name" type="text" />
            </div>
          )}

          <div className={styles.field}>
            <label htmlFor="email">Email</label>
            <input id="email" type="email" />
          </div>

          <div className={styles.field}>
            <label htmlFor="password">Password</label>
            <input id="password" type="password" />
          </div>

          {!isLogin && (
            <div className={styles.field}>
              <label htmlFor="social">Profile link</label>
              <input id="social" type="text" placeholder="facebook.com/…" />
              <p className={styles.hint}>
                Used by the owner to confirm who you are before releasing
                restricted titles.
              </p>
            </div>
          )}

          <button type="submit" className="btn btn-solid btn-block">
            {isLogin ? 'Sign in' : 'Register'}
          </button>
        </form>

        <div className={styles.orRow}>
          <span className={styles.orLine} />
          <span className={styles.orText}>or</span>
          <span className={styles.orLine} />
        </div>

        <button className="btn btn-block">
          <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Continue with Google
        </button>

        <p className={styles.footer}>
          {isLogin ? 'No account yet?' : 'Already registered?'}{' '}
          <button onClick={() => setIsLogin((v) => !v)} className={styles.switch}>
            <span className="tlink">{isLogin ? 'Register' : 'Sign in'}</span>
          </button>
        </p>
      </div>
    </div>
  );
}

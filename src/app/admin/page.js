'use client';

import { useState } from 'react';
import { CheckCircle, XCircle, Upload, Search, Library } from 'lucide-react';
import styles from './page.module.css';

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('users');

  const pendingUsers = [
    { id: 1, name: 'Ahmad Abdullah', email: 'ahmad@example.com', social: 'facebook.com/ahmad123' },
    { id: 2, name: 'Fatima Noor', email: 'fatima@example.com', social: 'instagram.com/fatima_n' },
  ];

  return (
    <div className={styles.adminPage}>
      <div className={styles.header}>
        <h1>Admin Dashboard</h1>
        <p>Manage pending user approvals and upload new books to the library.</p>
      </div>

      <div className={styles.tabs}>
        <div 
          className={`${styles.tab} ${activeTab === 'users' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('users')}
        >
          Pending Approvals
          <span className={styles.badge}>{pendingUsers.length}</span>
        </div>
        <div 
          className={`${styles.tab} ${activeTab === 'books' ? styles.activeTab : ''}`}
          onClick={() => setActiveTab('books')}
        >
          Manage Books
        </div>
      </div>

      {activeTab === 'users' && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Users waiting for approval</h2>
          </div>
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>User Details</th>
                  <th>Social Link (Verification)</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingUsers.map(user => (
                  <tr key={user.id}>
                    <td>
                      <div className={styles.userInfo}>
                        <div className={styles.avatar}>{user.name.charAt(0)}</div>
                        <div className={styles.userDetails}>
                          <span className={styles.userName}>{user.name}</span>
                          <span className={styles.userEmail}>{user.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <a href={`https://${user.social}`} target="_blank" rel="noopener noreferrer" className={styles.socialLink}>
                        {user.social}
                      </a>
                    </td>
                    <td>
                      <div className={styles.actionCell}>
                        <button className={styles.approveBtn}>
                          <CheckCircle size={16} /> Approve
                        </button>
                        <button className={styles.rejectBtn}>
                          <XCircle size={16} /> Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'books' && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Library Management</h2>
            <button className={styles.uploadBtn}>
              <Upload size={16} /> Add New Book
            </button>
          </div>
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Book Title</th>
                  <th>Category</th>
                  <th>Access Level</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <div className={styles.userInfo}>
                      <div className={styles.avatar} style={{borderRadius: '4px', backgroundColor: '#e3f2fd'}}>
                        <Library size={18} color="rgba(0,0,0,0.2)"/>
                      </div>
                      <div className={styles.userDetails}>
                        <span className={styles.userName}>Clean Code</span>
                        <span className={styles.userEmail}>Robert C. Martin</span>
                      </div>
                    </div>
                  </td>
                  <td>Software Engineering</td>
                  <td><span className={styles.badge} style={{backgroundColor: '#e67700'}}>Restricted</span></td>
                  <td>
                    <span className={styles.socialLink} style={{cursor:'pointer'}}>Edit</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}

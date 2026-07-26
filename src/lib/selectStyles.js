export const selectStyles = {
  control: (base, state) => ({
    ...base,
    background: 'var(--surface)',
    borderColor: state.isFocused ? 'var(--accent)' : 'var(--border)',
    boxShadow: state.isFocused ? '0 0 0 3px var(--accent-dim)' : 'none',
    '&:hover': { borderColor: 'var(--border-2)' },
    padding: '0.1rem',
    borderRadius: 'var(--r-sm)',
    color: 'var(--fg)',
    minHeight: '44px',
    cursor: 'text'
  }),
  menu: (base) => ({
    ...base,
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    zIndex: 100,
    boxShadow: 'var(--shadow-lg)'
  }),
  menuList: (base) => ({
    ...base,
    padding: '4px'
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isFocused ? 'var(--surface-3)' : 'transparent',
    color: 'var(--fg)',
    cursor: 'pointer',
    borderRadius: '4px',
    padding: '8px 12px',
    '&:active': { backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }
  }),
  singleValue: (base) => ({
    ...base,
    color: 'var(--fg)'
  }),
  multiValue: (base) => ({
    ...base,
    backgroundColor: 'var(--surface-3)',
    borderRadius: '4px'
  }),
  multiValueLabel: (base) => ({
    ...base,
    color: 'var(--fg)'
  }),
  multiValueRemove: (base) => ({
    ...base,
    color: 'var(--fg-2)',
    '&:hover': { backgroundColor: 'var(--hot)', color: '#fff' }
  }),
  input: (base) => ({
    ...base,
    color: 'var(--fg)'
  }),
  placeholder: (base) => ({
    ...base,
    color: 'var(--fg-3)'
  })
};

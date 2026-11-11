import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '../../components/dashboard/DashboardLayout';
import { useAuth } from '../../context/AuthContext';
import { apiUrl } from '../../utils/api';
import {
  connectGoogleSheets,
  getSheetsStatus,
  disconnectSheets,
  listSpreadsheets,
  createSpreadsheet,
  getSpreadsheetDetails,
  getSheetValues,
  updateSheetValues,
  appendSheetRow,
  syncSpreadsheetWithCatalog,
  SheetsUser,
  SpreadsheetSummary,
  SpreadsheetDetails,
  SheetValuesResponse
} from '../../services/googleSheetsService';
import {
  FileSpreadsheet,
  Plus,
  RefreshCw,
  Search,
  ExternalLink,
  Download,
  Save,
  CheckCircle2,
  AlertTriangle,
  ArrowUpDown,
  Filter,
  Layers,
  Sparkles,
  Edit2,
  X,
  LogOut,
  Table,
  Music,
  Wallet,
  Tag,
  Disc3,
  FileText
} from 'lucide-react';

export const GoogleSheetsPage: React.FC = () => {
  const { token, user } = useAuth();

  // Connection state
  const [connecting, setConnecting] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [connected, setConnected] = useState<boolean>(false);
  const [sheetsUser, setSheetsUser] = useState<SheetsUser | null>(null);

  // Spreadsheets list
  const [spreadsheets, setSpreadsheets] = useState<SpreadsheetSummary[]>([]);
  const [loadingList, setLoadingList] = useState<boolean>(false);
  const [selectedSpreadsheetId, setSelectedSpreadsheetId] = useState<string>('');
  const [spreadsheetDetails, setSpreadsheetDetails] = useState<SpreadsheetDetails | null>(null);

  // Active sheet tab & values
  const [activeSheetName, setActiveSheetName] = useState<string>('');
  const [sheetValues, setSheetValues] = useState<string[][]>([]);
  const [originalValues, setOriginalValues] = useState<string[][]>([]);
  const [loadingValues, setLoadingValues] = useState<boolean>(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [savingValues, setSavingValues] = useState<boolean>(false);

  // Search, Sort & Filter
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortColumnIndex, setSortColumnIndex] = useState<number | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Modals & sync state
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>('');
  const [newType, setNewType] = useState<'master_catalog' | 'blank'>('master_catalog');
  const [creating, setCreating] = useState<boolean>(false);

  const [addRowModalOpen, setAddRowModalOpen] = useState<boolean>(false);
  const [newRowData, setNewRowData] = useState<string[]>([]);
  const [addingRow, setAddingRow] = useState<boolean>(false);

  const [syncing, setSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<'xlsx' | 'csv' | 'pdf'>('xlsx');

  // Toasts
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const showToast = (type: 'success' | 'error' | 'info', text: string) => {
    setToastMessage({ type, text });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  };

  // Initial load
  useEffect(() => {
    if (!token) return;

    const checkStatus = async () => {
      setLoading(true);
      try {
        const status = await getSheetsStatus(token);
        if (status.connected) {
          setConnected(true);
          if (status.sheetsUser) setSheetsUser(status.sheetsUser);
          await loadSpreadsheetsList();
        } else {
          setConnected(false);
        }
      } catch (err: any) {
        console.error('Check Sheets status failed', err);
      } finally {
        setLoading(false);
      }
    };

    checkStatus();
  }, [token]);

  // Load spreadsheets list
  const loadSpreadsheetsList = async () => {
    if (!token) return;
    setLoadingList(true);
    try {
      const list = await listSpreadsheets(token);
      setSpreadsheets(list);
      if (list.length > 0 && !selectedSpreadsheetId) {
        // Select the first one by default
        handleSelectSpreadsheet(list[0].id);
      }
    } catch (err: any) {
      if (err.message && err.message.includes('TOKEN_EXPIRED')) {
        setConnected(false);
        showToast('error', 'Google authorization expired. Please reconnect.');
      } else {
        showToast('error', err.message || 'Failed to list Google Spreadsheets.');
      }
    } finally {
      setLoadingList(false);
    }
  };

  // Handle Select Spreadsheet
  const handleSelectSpreadsheet = async (spreadsheetId: string) => {
    if (!token || !spreadsheetId) return;
    setSelectedSpreadsheetId(spreadsheetId);
    setLoadingValues(true);
    try {
      const details = await getSpreadsheetDetails(token, spreadsheetId);
      setSpreadsheetDetails(details);
      if (details.sheets.length > 0) {
        const defaultSheet = details.sheets[0].title;
        setActiveSheetName(defaultSheet);
        await loadSheetData(spreadsheetId, defaultSheet);
      }
    } catch (err: any) {
      showToast('error', err.message || 'Failed to load spreadsheet details.');
    } finally {
      setLoadingValues(false);
    }
  };

  // Load Sheet Data
  const loadSheetData = async (spreadsheetId: string, sheetName: string) => {
    if (!token) return;
    setLoadingValues(true);
    try {
      const res: SheetValuesResponse = await getSheetValues(token, spreadsheetId, `${sheetName}!A1:Z100`);
      const rows = res.values || [];
      setSheetValues(rows);
      setOriginalValues(JSON.parse(JSON.stringify(rows)));
      setHasUnsavedChanges(false);
    } catch (err: any) {
      showToast('error', err.message || 'Failed to read sheet values.');
    } finally {
      setLoadingValues(false);
    }
  };

  // Switch Active Tab
  const handleTabChange = async (sheetName: string) => {
    if (sheetName === activeSheetName) return;
    if (hasUnsavedChanges) {
      if (!confirm('You have unsaved edits in this sheet. Switch tab anyway?')) {
        return;
      }
    }
    setActiveSheetName(sheetName);
    if (selectedSpreadsheetId) {
      await loadSheetData(selectedSpreadsheetId, sheetName);
    }
  };

  // Handle Connect
  const handleConnect = async () => {
    if (!token) return;
    setConnecting(true);
    try {
      const res = await connectGoogleSheets(token);
      setConnected(true);
      setSheetsUser(res.sheetsUser);
      showToast('success', 'Google Sheets connected successfully!');
      await loadSpreadsheetsList();
    } catch (err: any) {
      showToast('error', err.message || 'Failed to connect Google Sheets.');
    } finally {
      setConnecting(false);
    }
  };

  // Handle Disconnect
  const handleDisconnect = async () => {
    if (!token) return;
    if (confirm('Disconnect Google Sheets from Rudraatma Music?')) {
      await disconnectSheets(token);
      setConnected(false);
      setSheetsUser(null);
      setSpreadsheets([]);
      setSpreadsheetDetails(null);
      setSheetValues([]);
      showToast('info', 'Google Sheets disconnected.');
    }
  };

  // Create Spreadsheet
  const handleCreateSpreadsheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setCreating(true);
    try {
      const result = await createSpreadsheet(token, newTitle.trim(), newType);
      setCreateModalOpen(false);
      setNewTitle('');
      showToast('success', `Spreadsheet "${result.title}" created successfully!`);
      await loadSpreadsheetsList();
      handleSelectSpreadsheet(result.spreadsheetId);
    } catch (err: any) {
      showToast('error', err.message || 'Failed to create spreadsheet.');
    } finally {
      setCreating(false);
    }
  };

  // Synchronize with Catalog Data
  const handleSyncWithCatalog = async () => {
    if (!token || !selectedSpreadsheetId) return;
    setSyncing(true);
    try {
      const result = await syncSpreadsheetWithCatalog(token, selectedSpreadsheetId);
      setLastSyncTime(new Date(result.lastSynced).toLocaleTimeString());
      showToast('success', 'Master Catalog & Royalty Reports synchronized with Google Sheets!');
      if (activeSheetName) {
        await loadSheetData(selectedSpreadsheetId, activeSheetName);
      }
    } catch (err: any) {
      showToast('error', err.message || 'Failed to sync with Google Sheets.');
    } finally {
      setSyncing(false);
    }
  };

  // Cell Editing
  const handleCellChange = (rowIndex: number, colIndex: number, val: string) => {
    const updated = sheetValues.map((row, rIdx) => {
      if (rIdx !== rowIndex) return row;
      const newRow = [...row];
      while (newRow.length <= colIndex) newRow.push('');
      newRow[colIndex] = val;
      return newRow;
    });
    setSheetValues(updated);
    setHasUnsavedChanges(true);
  };

  // Save Edits to Google Sheets API
  const handleSaveChanges = async () => {
    if (!token || !selectedSpreadsheetId || !activeSheetName) return;
    setSavingValues(true);
    try {
      const maxCols = Math.max(...sheetValues.map((r) => r.length), 1);
      const endColLetter = String.fromCharCode(65 + Math.min(maxCols - 1, 25));
      const range = `${activeSheetName}!A1:${endColLetter}${sheetValues.length}`;

      await updateSheetValues(token, selectedSpreadsheetId, range, sheetValues);
      setOriginalValues(JSON.parse(JSON.stringify(sheetValues)));
      setHasUnsavedChanges(false);
      showToast('success', 'Changes saved directly to Google Sheets!');
    } catch (err: any) {
      showToast('error', err.message || 'Failed to save changes.');
    } finally {
      setSavingValues(false);
    }
  };

  // Add Row
  const handleOpenAddRow = () => {
    const headers = sheetValues[0] || ['Column 1', 'Column 2', 'Column 3'];
    setNewRowData(new Array(headers.length).fill(''));
    setAddRowModalOpen(true);
  };

  const handleConfirmAddRow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedSpreadsheetId || !activeSheetName) return;
    setAddingRow(true);
    try {
      await appendSheetRow(token, selectedSpreadsheetId, activeSheetName, newRowData);
      setAddRowModalOpen(false);
      showToast('success', 'Row appended to Google Sheet!');
      await loadSheetData(selectedSpreadsheetId, activeSheetName);
    } catch (err: any) {
      showToast('error', err.message || 'Failed to append row.');
    } finally {
      setAddingRow(false);
    }
  };

  // Sorting
  const handleSort = (colIndex: number) => {
    if (sortColumnIndex === colIndex) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortColumnIndex(null);
        setSortDirection('asc');
      }
    } else {
      setSortColumnIndex(colIndex);
      setSortDirection('asc');
    }
  };

  // Compute filtered & sorted rows
  const headerRow = sheetValues[0] || [];
  let displayDataRows = sheetValues.slice(1);

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    displayDataRows = displayDataRows.filter((row) =>
      row.some((cell) => cell.toLowerCase().includes(q))
    );
  }

  if (sortColumnIndex !== null) {
    displayDataRows = [...displayDataRows].sort((a, b) => {
      const valA = (a[sortColumnIndex] || '').trim();
      const valB = (b[sortColumnIndex] || '').trim();
      const numA = parseFloat(valA.replace(/[^0-9.-]/g, ''));
      const numB = parseFloat(valB.replace(/[^0-9.-]/g, ''));

      if (!isNaN(numA) && !isNaN(numB)) {
        return sortDirection === 'asc' ? numA - numB : numB - numA;
      }
      return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });
  }

  return (
    <DashboardLayout title="Google Sheets Integration">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl animate-in slide-in-from-bottom-5 duration-200 text-xs font-medium ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/95 border-emerald-500/50 text-emerald-200'
              : toastMessage.type === 'error'
              ? 'bg-rose-950/95 border-rose-500/50 text-rose-200'
              : 'bg-blue-950/95 border-blue-500/50 text-blue-200'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : toastMessage.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <FileSpreadsheet className="w-4 h-4 text-blue-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 hover:opacity-80 p-0.5 rounded">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="space-y-6">
        {/* Top Header Card */}
        <div className="bg-[#0b1222] border border-slate-800 rounded-2xl p-6 sm:p-7 relative overflow-hidden">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold mb-3">
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Google Sheets API v4 Integration</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                Catalog & Royalty Spreadsheets
              </h1>
              <p className="text-sm text-slate-400 mt-1.5 max-w-2xl leading-relaxed">
                Connect your Google account to read, write, and automatically synchronize verified artist catalogs, label metadata, monthly royalties, and platform streaming statements into Google Spreadsheets.
              </p>
            </div>

            {/* Connection Actions */}
            <div>
              {loading ? (
                <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                  Verifying Google connection...
                </div>
              ) : connected ? (
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <div className="flex items-center gap-3 bg-[#080d1a] border border-slate-800 px-3.5 py-2 rounded-xl">
                    {sheetsUser?.photoUrl ? (
                      <img
                        src={sheetsUser.photoUrl}
                        alt="Google User"
                        className="w-8 h-8 rounded-full border border-emerald-500/40"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-emerald-600/20 text-emerald-400 font-bold flex items-center justify-center text-xs">
                        {sheetsUser?.displayName?.charAt(0) || 'G'}
                      </div>
                    )}
                    <div>
                      <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                        <span>{sheetsUser?.displayName || 'Google Account'}</span>
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      </div>
                      <div className="text-[11px] font-mono text-slate-400">
                        {sheetsUser?.email || 'OAuth 2.0 Connected'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={loadSpreadsheetsList}
                      disabled={loadingList}
                      className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors"
                      title="Refresh sheets"
                    >
                      <RefreshCw className={`w-4 h-4 ${loadingList ? 'animate-spin text-emerald-400' : ''}`} />
                    </button>
                    <button
                      onClick={handleDisconnect}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-950/30 hover:bg-rose-950/50 border border-rose-800/40 rounded-xl transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Disconnect</span>
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleConnect}
                  disabled={connecting}
                  className="inline-flex items-center gap-2.5 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-lg shadow-emerald-600/30 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>{connecting ? 'Connecting...' : 'Connect Google Sheets'}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Not Connected State Card */}
        {!connected && !loading && (
          <div className="bg-[#0b1222] border border-slate-800 rounded-2xl p-8 sm:p-12 text-center max-w-2xl mx-auto my-8">
            <div className="w-16 h-16 rounded-2xl bg-emerald-600/10 border border-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center mb-5">
              <FileSpreadsheet className="w-8 h-8" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
              Sync Real Music Royalties to Google Sheets
            </h2>
            <p className="text-sm text-slate-400 max-w-md mx-auto mb-6 leading-relaxed">
              Connect your Google account to automatically generate, write and update multi-sheet spreadsheets containing your authentic artists, record labels, catalog releases, and streaming revenue reports.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left max-w-lg mx-auto mb-8">
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
                <Music className="w-4 h-4 text-emerald-400 mb-1" />
                <div className="font-semibold text-white">Catalog & UPCs</div>
                <div className="text-slate-400 text-[11px]">Releases, ISRC & tracks</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
                <Wallet className="w-4 h-4 text-blue-400 mb-1" />
                <div className="font-semibold text-white">Monthly Royalties</div>
                <div className="text-slate-400 text-[11px]">Gross, net & DSP fees</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
                <Disc3 className="w-4 h-4 text-purple-400 mb-1" />
                <div className="font-semibold text-white">DSP Stream Reports</div>
                <div className="text-slate-400 text-[11px]">Spotify, Apple, JioSaavn</div>
              </div>
            </div>

            <button
              onClick={handleConnect}
              disabled={connecting}
              className="inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-xl shadow-emerald-600/25 transition-all hover:scale-[1.02]"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>{connecting ? 'Authorizing in popup...' : 'Connect Google Sheets'}</span>
            </button>
          </div>
        )}

        {/* Connected Dashboard View */}
        {connected && (
          <div className="space-y-4">
            {/* Top Control Bar: Spreadsheet Selector, Create Button, Auto-Sync Button, Export */}
            <div className="bg-[#090e1a] border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col gap-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Left: Spreadsheet Selector Dropdown */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
                  <div className="text-xs font-semibold text-slate-300 whitespace-nowrap flex items-center gap-1.5">
                    <Table className="w-4 h-4 text-emerald-400" />
                    <span>Select Spreadsheet:</span>
                  </div>

                  {loadingList ? (
                    <div className="text-xs text-slate-500 font-mono flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                      Loading sheets...
                    </div>
                  ) : spreadsheets.length === 0 ? (
                    <span className="text-xs text-slate-400 font-mono">No spreadsheets found. Create one below!</span>
                  ) : (
                    <select
                      value={selectedSpreadsheetId}
                      onChange={(e) => handleSelectSpreadsheet(e.target.value)}
                      className="bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 max-w-md w-full"
                    >
                      {spreadsheets.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Right: Actions (Create, Sync with Catalog, Export) */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    onClick={() => setCreateModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shadow-sm"
                  >
                    <Plus className="w-4 h-4" />
                    <span>New Spreadsheet</span>
                  </button>

                  {selectedSpreadsheetId && (
                    <>
                      {/* One-click Sync with Catalog */}
                      <button
                        onClick={handleSyncWithCatalog}
                        disabled={syncing}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 font-semibold text-xs transition-colors disabled:opacity-50"
                        title="Synchronize latest artist catalog, releases and royalties into this sheet"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin text-blue-400' : 'text-blue-400'}`} />
                        <span>{syncing ? 'Syncing...' : 'Sync Catalog Data'}</span>
                      </button>

                      {/* Export Dropdown */}
                      <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl overflow-hidden p-0.5">
                        <select
                          value={exportFormat}
                          onChange={(e) => setExportFormat(e.target.value as any)}
                          className="bg-transparent text-xs text-slate-300 px-2 py-1.5 focus:outline-none font-mono"
                        >
                          <option value="xlsx">Excel (.xlsx)</option>
                          <option value="csv">CSV (.csv)</option>
                          <option value="pdf">PDF (.pdf)</option>
                        </select>
                        <a
                          href={apiUrl(`/api/sheets/${selectedSpreadsheetId}/export?format=${exportFormat}`)}
                          download
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg transition-colors"
                          title="Export file"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Export</span>
                        </a>
                      </div>

                      {/* Open in Google Sheets link */}
                      {spreadsheetDetails?.webViewLink && (
                        <a
                          href={spreadsheetDetails.webViewLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors"
                          title="Open directly in Google Sheets in a new tab"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Status and Sync Notice */}
              {lastSyncTime && (
                <div className="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5 pt-2 border-t border-slate-800/60">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Last synchronized with Rudraatma Music catalog at {lastSyncTime}</span>
                </div>
              )}
            </div>

            {/* Active Spreadsheet Content */}
            {selectedSpreadsheetId && spreadsheetDetails && (
              <div className="bg-[#090e1a] border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
                {/* Sheet Tabs Bar */}
                <div className="bg-[#0b1222] border-b border-slate-800 px-4 py-2.5 flex items-center justify-between gap-4 overflow-x-auto">
                  <div className="flex items-center gap-1.5">
                    {spreadsheetDetails.sheets.map((sheet) => (
                      <button
                        key={sheet.sheetId}
                        onClick={() => handleTabChange(sheet.title)}
                        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                          activeSheetName === sheet.title
                            ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
                            : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                        }`}
                      >
                        <FileText className="w-3 h-3" />
                        <span>{sheet.title}</span>
                      </button>
                    ))}
                  </div>

                  {/* Actions on active sheet: Add Row, Save Changes */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={handleOpenAddRow}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Add Row</span>
                    </button>

                    {hasUnsavedChanges && (
                      <button
                        onClick={handleSaveChanges}
                        disabled={savingValues}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors shadow-sm disabled:opacity-50 animate-pulse"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{savingValues ? 'Saving...' : 'Save to Sheets'}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Search & Filter Toolbar */}
                <div className="p-3 border-b border-slate-800/80 bg-slate-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={`Search in ${activeSheetName}...`}
                      className="w-full pl-8 pr-7 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <div className="text-[11px] font-mono text-slate-400 flex items-center gap-3">
                    <span>
                      {displayDataRows.length} {displayDataRows.length === 1 ? 'row' : 'rows'}
                    </span>
                    {hasUnsavedChanges && (
                      <span className="text-amber-400 font-semibold flex items-center gap-1">
                        <Edit2 className="w-3 h-3" /> Unsaved edits
                      </span>
                    )}
                  </div>
                </div>

                {/* Table View / Editor */}
                {loadingValues ? (
                  <div className="py-20 text-center">
                    <RefreshCw className="w-6 h-6 animate-spin text-emerald-400 mx-auto mb-2" />
                    <div className="text-xs font-mono text-slate-400">Loading {activeSheetName} from Google Sheets...</div>
                  </div>
                ) : sheetValues.length === 0 ? (
                  <div className="py-16 text-center text-xs text-slate-400">
                    This sheet is currently empty. Click <strong>Add Row</strong> or <strong>Sync Catalog Data</strong> to populate it.
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      {/* Header Row */}
                      <thead className="bg-[#0b1222] sticky top-0 z-10 border-b border-slate-800">
                        <tr>
                          <th className="py-2.5 px-3 w-10 text-center text-slate-500 font-mono border-r border-slate-800/80">#</th>
                          {headerRow.map((colName, cIdx) => (
                            <th
                              key={cIdx}
                              onClick={() => handleSort(cIdx)}
                              className="py-2.5 px-3 text-slate-300 font-semibold border-r border-slate-800/80 cursor-pointer hover:bg-slate-800/50 select-none whitespace-nowrap"
                            >
                              <div className="flex items-center justify-between gap-1.5">
                                <span>{colName || `Col ${cIdx + 1}`}</span>
                                <ArrowUpDown
                                  className={`w-3 h-3 ${
                                    sortColumnIndex === cIdx ? 'text-emerald-400' : 'text-slate-600'
                                  }`}
                                />
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>

                      {/* Data Rows */}
                      <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                        {displayDataRows.map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-2 px-3 text-center text-slate-500 border-r border-slate-800/60 bg-[#090e1a]/80 select-none">
                              {rIdx + 1}
                            </td>
                            {headerRow.map((_, cIdx) => {
                              const cellValue = row[cIdx] !== undefined ? row[cIdx] : '';
                              return (
                                <td key={cIdx} className="p-0 border-r border-slate-800/60">
                                  <input
                                    type="text"
                                    value={cellValue}
                                    onChange={(e) => handleCellChange(rIdx + 1, cIdx, e.target.value)}
                                    className="w-full px-3 py-1.5 bg-transparent text-slate-200 focus:bg-slate-900 focus:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ======================== MODALS ======================== */}

      {/* 1. Create Spreadsheet Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#0b1222] border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Create Google Spreadsheet</h3>
              </div>
              <button onClick={() => setCreateModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSpreadsheet} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Spreadsheet Title
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder={`e.g. Rudraatma Music – Master Catalog 2026`}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Template Type
                </label>
                <div className="space-y-2">
                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-900 border border-slate-800 cursor-pointer hover:border-emerald-500/50">
                    <input
                      type="radio"
                      name="templateType"
                      checked={newType === 'master_catalog'}
                      onChange={() => setNewType('master_catalog')}
                      className="mt-0.5 text-emerald-500"
                    />
                    <div className="text-xs">
                      <div className="font-semibold text-white">Master Catalog & Royalty Tracker (Recommended)</div>
                      <div className="text-slate-400 text-[11px] mt-0.5">
                        Creates Overview, Artists, Labels, Releases, Monthly Royalties, and Streaming Reports tabs pre-populated with your verified portal data.
                      </div>
                    </div>
                  </label>

                  <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-900 border border-slate-800 cursor-pointer hover:border-emerald-500/50">
                    <input
                      type="radio"
                      name="templateType"
                      checked={newType === 'blank'}
                      onChange={() => setNewType('blank')}
                      className="mt-0.5 text-emerald-500"
                    />
                    <div className="text-xs">
                      <div className="font-semibold text-white">Blank Spreadsheet</div>
                      <div className="text-slate-400 text-[11px] mt-0.5">
                        Creates an empty single-sheet spreadsheet for custom reporting.
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newTitle.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50 shadow-md shadow-emerald-600/30"
                >
                  {creating ? 'Creating...' : 'Create Spreadsheet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Add Row Modal */}
      {addRowModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#0b1222] border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Add Row to {activeSheetName}</h3>
              </div>
              <button onClick={() => setAddRowModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmAddRow} className="mt-4 space-y-3">
              {headerRow.map((colName, idx) => (
                <div key={idx}>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    {colName || `Column ${idx + 1}`}
                  </label>
                  <input
                    type="text"
                    value={newRowData[idx] || ''}
                    onChange={(e) => {
                      const updated = [...newRowData];
                      updated[idx] = e.target.value;
                      setNewRowData(updated);
                    }}
                    placeholder={`Enter ${colName || 'value'}...`}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              ))}

              <div className="flex items-center justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setAddRowModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingRow}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
                >
                  {addingRow ? 'Adding...' : 'Append Row to Sheet'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

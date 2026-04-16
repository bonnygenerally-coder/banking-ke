import React, { useState, useEffect, createContext, useContext } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { Toaster, toast } from "sonner";
import { HelmetProvider } from "react-helmet-async";
import LandingPage from "@/pages/LandingPage";
import SEO from "@/components/SEO";

// Components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Textarea } from "@/components/ui/textarea";

// Icons from lucide-react
import { 
  Wallet, PiggyBank, TrendingUp, CreditCard, Bell, User, LogOut, 
  ChevronRight, ArrowUpRight, ArrowDownLeft, Clock, CheckCircle2, 
  XCircle, AlertCircle, FileText, Home, Settings, Shield, Phone,
  Lock, Eye, EyeOff, Menu, X, Download, Plus, Minus, RefreshCw,
  Building2, Users, Percent, BarChart3, Smartphone, Banknote, 
  Send, Receipt, ClipboardList, Edit, Trash2, Copy, ExternalLink,
  Upload, Image, Calendar, Zap, Briefcase, Globe, MapPin
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Auth Context
const AuthContext = createContext(null);

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [admin, setAdmin] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [adminToken, setAdminToken] = useState(localStorage.getItem("adminToken"));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      if (token) {
        try {
          const res = await axios.get(`${API}/user/profile`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          setUser(res.data);
        } catch {
          localStorage.removeItem("token");
          setToken(null);
        }
      }
      setLoading(false);
    };
    initAuth();
  }, [token]);

  const login = (tokenValue, userData) => {
    localStorage.setItem("token", tokenValue);
    setToken(tokenValue);
    setUser(userData);
  };

  const adminLogin = (tokenValue, adminData) => {
    localStorage.setItem("adminToken", tokenValue);
    setAdminToken(tokenValue);
    setAdmin(adminData);
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
  };

  const adminLogout = () => {
    localStorage.removeItem("adminToken");
    setAdminToken(null);
    setAdmin(null);
  };

  return (
    <AuthContext.Provider value={{ user, admin, token, adminToken, login, adminLogin, logout, adminLogout, loading, setUser }}>
      {children}
    </AuthContext.Provider>
  );
};

// API helper with auth and improved error handling
const apiCall = async (method, endpoint, data = null, token = null, retries = 1) => {
  const config = {
    method,
    url: `${API}${endpoint}`,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    data,
    timeout: 30000 // 30 second timeout
  };
  
  let lastError;
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      lastError = error;
      // Check if it's a network error (not a server response error)
      if (!error.response && i < retries) {
        // Wait a bit before retry on network errors
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      // On last retry or non-network error, throw
      break;
    }
  }
  throw lastError;
};

// ================== AUTH PAGES ==================

const LoginPage = () => {
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [otp, setOtp] = useState("");
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiCall("POST", "/auth/login", { phone, pin });
      if (res.requires_verification) {
        setNeedsVerification(true);
        toast.info("Please verify your phone with OTP sent to your number");
      } else {
        login(res.token, res.user);
        toast.success("Welcome back!");
        navigate("/dashboard");
      }
    } catch (err) {
      // Differentiate between network errors and server errors
      if (!err.response) {
        toast.error("Connection failed. Please check your internet and try again.");
      } else {
        toast.error(err.response?.data?.detail || "Invalid credentials");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    setLoading(true);
    try {
      const res = await apiCall("POST", "/auth/verify-otp", { phone, otp });
      login(res.token, res.user);
      toast.success("Phone verified!");
      navigate("/dashboard");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Invalid OTP");
    } finally {
      setLoading(false);
    }
  };

  if (needsVerification) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-emerald-800 to-primary flex items-center justify-center p-4">
        <Card className="w-full max-w-md animate-scale-in">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Phone className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="font-heading text-2xl">Verify Your Phone</CardTitle>
            <CardDescription>Enter the 6-digit code sent to {phone}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex justify-center">
              <InputOTP maxLength={6} value={otp} onChange={setOtp} data-testid="otp-input">
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
            </div>
            <Button 
              className="w-full h-12 rounded-full font-semibold" 
              onClick={handleVerifyOTP}
              disabled={otp.length !== 6 || loading}
              data-testid="verify-otp-btn"
            >
              {loading ? "Verifying..." : "Verify & Continue"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-emerald-800 to-primary flex items-center justify-center p-4">
      <SEO 
        title="Login"
        description="Sign in to your Dolaglobo Finance account. Access your digital wallet, manage savings, apply for loans, and more."
        keywords="Dolaglobo login, digital wallet login Kenya, M-Pesa wallet sign in"
        canonical="/login"
      />
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        <div className="text-center text-white">
          <h1 className="font-heading text-4xl font-black tracking-tight mb-2">Dolaglobo</h1>
          <p className="text-emerald-100 text-lg">Finance for Growth</p>
        </div>
        
        <Card className="shadow-xl">
          <CardHeader className="text-center">
            <CardTitle className="font-heading text-2xl">Welcome Back</CardTitle>
            <CardDescription>Sign in to your account</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="0712345678"
                    className="pl-10 h-12"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    data-testid="login-phone-input"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="pin">PIN</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="pin"
                    type={showPin ? "text" : "password"}
                    placeholder="4-digit PIN"
                    maxLength={4}
                    className="pl-10 pr-10 h-12 tracking-widest"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                    data-testid="login-pin-input"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPin(!showPin)}
                  >
                    {showPin ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full h-12 rounded-full font-semibold text-lg"
                disabled={loading || phone.length < 9 || pin.length !== 4}
                data-testid="login-btn"
              >
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
            
            <div className="mt-6 text-center space-y-2">
              <Button variant="link" onClick={() => navigate("/forgot-pin")} data-testid="forgot-pin-link">
                Forgot PIN?
              </Button>
              <p className="text-sm text-muted-foreground">
                Don&apos;t have an account?{" "}
                <Button variant="link" className="p-0 h-auto" onClick={() => navigate("/register")} data-testid="register-link">
                  Register
                </Button>
              </p>
            </div>
          </CardContent>
        </Card>
        
        <div className="text-center space-y-2">
          <div className="flex justify-center gap-4 text-sm">
            <Button variant="link" className="text-white/60 hover:text-white p-0 h-auto" onClick={() => navigate("/faqs")}>
              FAQs
            </Button>
            <span className="text-white/40">•</span>
            <Button variant="link" className="text-white/60 hover:text-white p-0 h-auto" onClick={() => navigate("/terms")}>
              Terms
            </Button>
            <span className="text-white/40">•</span>
            <Button variant="link" className="text-white/60 hover:text-white p-0 h-auto" onClick={() => navigate("/privacy")}>
              Privacy
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

const RegisterPage = () => {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();
  
  // Legal documents state
  const [legalDocs, setLegalDocs] = useState({ terms: null, privacy: null });
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [viewingDoc, setViewingDoc] = useState(null); // "terms" or "privacy"
  
  // Fetch legal documents on mount
  useEffect(() => {
    const fetchLegalDocs = async () => {
      try {
        const res = await axios.get(`${API}/content/legal`);
        setLegalDocs({ terms: res.data.terms, privacy: res.data.privacy });
      } catch (err) {
        console.error("Failed to fetch legal documents", err);
      }
    };
    fetchLegalDocs();
  }, []);

  const handleRegister = async (e) => {
    e.preventDefault();
    if (pin !== confirmPin) {
      toast.error("PINs don't match");
      return;
    }
    
    // Check consent if documents exist
    if (legalDocs.terms && !termsAccepted) {
      toast.error("Please accept the Terms & Conditions");
      return;
    }
    if (legalDocs.privacy && !privacyAccepted) {
      toast.error("Please accept the Privacy Policy");
      return;
    }
    
    setLoading(true);
    try {
      const registerData = { phone, pin, name };
      if (legalDocs.terms) registerData.terms_version_accepted = legalDocs.terms.version;
      if (legalDocs.privacy) registerData.privacy_version_accepted = legalDocs.privacy.version;
      
      const res = await apiCall("POST", "/auth/register", registerData);
      
      // Check if OTP verification is required
      if (res.requires_otp) {
        toast.success("OTP sent to your phone");
        setStep(2);
      } else {
        // OTP disabled - user is auto-logged in
        login(res.token, res.user);
        toast.success("Welcome to Dolaglobo Finance!");
        navigate("/dashboard");
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    setLoading(true);
    try {
      const res = await apiCall("POST", "/auth/verify-otp", { phone, otp });
      login(res.token, res.user);
      toast.success("Welcome to Dolaglobo Finance!");
      navigate("/dashboard");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Invalid OTP");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-emerald-800 to-primary flex items-center justify-center p-4">
      <SEO 
        title="Register - Create Account"
        description="Join Dolaglobo Finance today. Create your free digital wallet account to send money, receive payments, apply for loans, and save smarter in Kenya."
        keywords="Dolaglobo register, create account, digital wallet Kenya, M-Pesa wallet, sign up, open account"
        canonical="/register"
      />
      <div className="w-full max-w-md space-y-8 animate-fade-in">
        <div className="text-center text-white">
          <h1 className="font-heading text-4xl font-black tracking-tight mb-2">Dolaglobo</h1>
          <p className="text-emerald-100 text-lg">Finance for Growth</p>
        </div>
        
        <Card className="shadow-xl">
          <CardHeader className="text-center">
            <CardTitle className="font-heading text-2xl">
              {step === 1 ? "Create Account" : "Verify Phone"}
            </CardTitle>
            <CardDescription>
              {step === 1 ? "Start your financial journey" : `Enter OTP sent to ${phone}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {step === 1 ? (
              <form onSubmit={handleRegister} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="name"
                      type="text"
                      placeholder="John Doe"
                      className="pl-10 h-12"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      data-testid="register-name-input"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="0712345678"
                      className="pl-10 h-12"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      data-testid="register-phone-input"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="pin">Create PIN</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="pin"
                      type={showPin ? "text" : "password"}
                      placeholder="4-digit PIN"
                      maxLength={4}
                      className="pl-10 pr-10 h-12 tracking-widest"
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                      data-testid="register-pin-input"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPin(!showPin)}
                    >
                      {showPin ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="confirmPin">Confirm PIN</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                    <Input
                      id="confirmPin"
                      type={showPin ? "text" : "password"}
                      placeholder="Confirm PIN"
                      maxLength={4}
                      className="pl-10 h-12 tracking-widest"
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                      data-testid="register-confirm-pin-input"
                    />
                  </div>
                </div>

                {/* Legal Consent Section */}
                {(legalDocs.terms || legalDocs.privacy) && (
                  <div className="space-y-3 p-3 bg-slate-50 rounded-lg border">
                    {legalDocs.terms && (
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          id="terms-accept"
                          checked={termsAccepted}
                          onChange={(e) => setTermsAccepted(e.target.checked)}
                          className="mt-1 h-4 w-4 rounded border-gray-300"
                          data-testid="terms-checkbox"
                        />
                        <label htmlFor="terms-accept" className="text-sm text-muted-foreground">
                          I accept the{" "}
                          <button
                            type="button"
                            className="text-primary hover:underline font-medium"
                            onClick={() => setViewingDoc("terms")}
                          >
                            Terms & Conditions
                          </button>
                          {" "}(v{legalDocs.terms.version})
                        </label>
                      </div>
                    )}
                    {legalDocs.privacy && (
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          id="privacy-accept"
                          checked={privacyAccepted}
                          onChange={(e) => setPrivacyAccepted(e.target.checked)}
                          className="mt-1 h-4 w-4 rounded border-gray-300"
                          data-testid="privacy-checkbox"
                        />
                        <label htmlFor="privacy-accept" className="text-sm text-muted-foreground">
                          I accept the{" "}
                          <button
                            type="button"
                            className="text-primary hover:underline font-medium"
                            onClick={() => setViewingDoc("privacy")}
                          >
                            Privacy Policy
                          </button>
                          {" "}(v{legalDocs.privacy.version})
                        </label>
                      </div>
                    )}
                  </div>
                )}

                <Button 
                  type="submit" 
                  className="w-full h-12 rounded-full font-semibold text-lg"
                  disabled={loading || !name || phone.length < 9 || pin.length !== 4 || confirmPin.length !== 4 || (legalDocs.terms && !termsAccepted) || (legalDocs.privacy && !privacyAccepted)}
                  data-testid="register-btn"
                >
                  {loading ? "Creating account..." : "Register"}
                </Button>
              </form>
            ) : (
              <div className="space-y-6">
                <div className="flex justify-center">
                  <InputOTP maxLength={6} value={otp} onChange={setOtp} data-testid="register-otp-input">
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <Button 
                  className="w-full h-12 rounded-full font-semibold" 
                  onClick={handleVerifyOTP}
                  disabled={otp.length !== 6 || loading}
                  data-testid="register-verify-btn"
                >
                  {loading ? "Verifying..." : "Verify & Continue"}
                </Button>
              </div>
            )}

            {/* Document Viewer Dialog */}
            <Dialog open={viewingDoc !== null} onOpenChange={() => setViewingDoc(null)}>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>
                    {viewingDoc === "terms" ? "Terms & Conditions" : "Privacy Policy"}
                  </DialogTitle>
                </DialogHeader>
                <div className="prose prose-sm max-w-none whitespace-pre-wrap">
                  {viewingDoc === "terms" ? legalDocs.terms?.content : legalDocs.privacy?.content}
                </div>
                <DialogFooter>
                  <Button onClick={() => setViewingDoc(null)}>Close</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            
            <div className="mt-6 text-center">
              <p className="text-sm text-muted-foreground">
                Already have an account?{" "}
                <Button variant="link" className="p-0 h-auto" onClick={() => navigate("/login")} data-testid="login-link">
                  Sign In
                </Button>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// ================== PUBLIC CONTENT PAGES ==================

const FAQsPage = () => {
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchFaqs = async () => {
      try {
        const res = await axios.get(`${API}/content/faqs`);
        setFaqs(res.data.faqs || []);
      } catch (err) {
        console.error("Failed to fetch FAQs", err);
      } finally {
        setLoading(false);
      }
    };
    fetchFaqs();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-emerald-800 to-primary p-4">
      <div className="max-w-3xl mx-auto py-8">
        <Button variant="ghost" className="text-white mb-4" onClick={() => navigate(-1)}>
          <ChevronRight className="h-4 w-4 mr-2 rotate-180" /> Back
        </Button>
        
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-2xl flex items-center gap-2">
              <AlertCircle className="h-6 w-6 text-primary" />
              Frequently Asked Questions
            </CardTitle>
            <CardDescription>Find answers to common questions about Dolaglobo Finance</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : faqs.length > 0 ? (
              <div className="space-y-4">
                {faqs.map((faq, index) => (
                  <div key={faq.id || index} className="border rounded-lg p-4">
                    <h3 className="font-semibold text-lg mb-2">{faq.question}</h3>
                    <p className="text-muted-foreground">{faq.answer}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">No FAQs available yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const TermsPage = () => {
  const [terms, setTerms] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchTerms = async () => {
      try {
        const res = await axios.get(`${API}/content/terms`);
        setTerms(res.data.terms);
      } catch (err) {
        console.error("Failed to fetch terms", err);
      } finally {
        setLoading(false);
      }
    };
    fetchTerms();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-emerald-800 to-primary p-4">
      <div className="max-w-3xl mx-auto py-8">
        <Button variant="ghost" className="text-white mb-4" onClick={() => navigate(-1)}>
          <ChevronRight className="h-4 w-4 mr-2 rotate-180" /> Back
        </Button>
        
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-2xl flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              Terms & Conditions
            </CardTitle>
            {terms && (
              <CardDescription>
                Version {terms.version} • Last updated: {new Date(terms.activated_at || terms.created_at).toLocaleDateString()}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : terms ? (
              <div className="prose prose-sm max-w-none whitespace-pre-wrap">
                {terms.content}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">No terms and conditions available yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const PrivacyPage = () => {
  const [privacy, setPrivacy] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchPrivacy = async () => {
      try {
        const res = await axios.get(`${API}/content/privacy`);
        setPrivacy(res.data.privacy);
      } catch (err) {
        console.error("Failed to fetch privacy policy", err);
      } finally {
        setLoading(false);
      }
    };
    fetchPrivacy();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-emerald-800 to-primary p-4">
      <div className="max-w-3xl mx-auto py-8">
        <Button variant="ghost" className="text-white mb-4" onClick={() => navigate(-1)}>
          <ChevronRight className="h-4 w-4 mr-2 rotate-180" /> Back
        </Button>
        
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-2xl flex items-center gap-2">
              <Shield className="h-6 w-6 text-primary" />
              Privacy Policy
            </CardTitle>
            {privacy && (
              <CardDescription>
                Version {privacy.version} • Last updated: {new Date(privacy.activated_at || privacy.created_at).toLocaleDateString()}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : privacy ? (
              <div className="prose prose-sm max-w-none whitespace-pre-wrap">
                {privacy.content}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">No privacy policy available yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const ForgotPinPage = () => {
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [newPin, setNewPin] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRequestOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiCall("POST", `/auth/request-otp?phone=${encodeURIComponent(phone)}`);
      toast.success("OTP sent to your phone");
      setStep(2);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPin = async () => {
    if (newPin.length !== 4) {
      toast.error("PIN must be 4 digits");
      return;
    }
    setLoading(true);
    try {
      await apiCall("POST", "/auth/reset-pin", { phone, otp, new_pin: newPin });
      toast.success("PIN reset successfully!");
      navigate("/login");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to reset PIN");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-900 via-emerald-800 to-primary flex items-center justify-center p-4">
      <Card className="w-full max-w-md animate-scale-in">
        <CardHeader className="text-center">
          <CardTitle className="font-heading text-2xl">Reset PIN</CardTitle>
          <CardDescription>
            {step === 1 ? "Enter your phone number" : "Enter OTP and new PIN"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 1 ? (
            <form onSubmit={handleRequestOTP} className="space-y-5">
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                  <Input
                    type="tel"
                    placeholder="0712345678"
                    className="pl-10 h-12"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    data-testid="forgot-phone-input"
                  />
                </div>
              </div>
              <Button 
                type="submit" 
                className="w-full h-12 rounded-full"
                disabled={loading || phone.length < 9}
                data-testid="request-otp-btn"
              >
                {loading ? "Sending..." : "Send OTP"}
              </Button>
            </form>
          ) : (
            <div className="space-y-5">
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <div className="space-y-2">
                <Label>New PIN</Label>
                <Input
                  type="password"
                  placeholder="4-digit PIN"
                  maxLength={4}
                  className="h-12 text-center tracking-widest text-lg"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                  data-testid="new-pin-input"
                />
              </div>
              <Button 
                className="w-full h-12 rounded-full"
                onClick={handleResetPin}
                disabled={loading || otp.length !== 6 || newPin.length !== 4}
                data-testid="reset-pin-btn"
              >
                {loading ? "Resetting..." : "Reset PIN"}
              </Button>
            </div>
          )}
          <div className="mt-6 text-center">
            <Button variant="link" onClick={() => navigate("/login")} data-testid="back-to-login">
              Back to Login
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ================== USER DASHBOARD ==================

const UserLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { path: "/dashboard", icon: Home, label: "Dashboard" },
    { path: "/wallet", icon: Wallet, label: "Wallet" },
    { path: "/deposit", icon: Smartphone, label: "Deposit" },
    { path: "/withdraw", icon: Send, label: "Withdraw" },
    { path: "/airtime", icon: Phone, label: "Airtime" },
    { path: "/savings", icon: PiggyBank, label: "Savings" },
    { path: "/mmf", icon: TrendingUp, label: "MMF" },
    { path: "/loans", icon: CreditCard, label: "Loans" },
    { path: "/statements", icon: FileText, label: "Statements" },
    { path: "/notifications", icon: Bell, label: "Alerts" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      <header className="sticky top-0 z-50 bg-card border-b md:hidden">
        <div className="flex items-center justify-between p-4">
          <h1 className="font-heading font-bold text-xl text-primary">Dolaglobo</h1>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate("/notifications")} data-testid="mobile-notifications">
              <Bell className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} data-testid="mobile-menu-toggle">
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>
        
        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <nav className="border-t bg-card p-4 space-y-2 animate-slide-up">
            {navItems.map((item) => (
              <Button
                key={item.path}
                variant={location.pathname === item.path ? "secondary" : "ghost"}
                className="w-full justify-start"
                onClick={() => { navigate(item.path); setMobileMenuOpen(false); }}
                data-testid={`mobile-nav-${item.label.toLowerCase()}`}
              >
                <item.icon className="mr-3 h-5 w-5" />
                {item.label}
              </Button>
            ))}
            <Separator className="my-2" />
            <Button variant="ghost" className="w-full justify-start" onClick={() => navigate("/profile")} data-testid="mobile-profile">
              <User className="mr-3 h-5 w-5" />
              Profile
            </Button>
            <Button variant="ghost" className="w-full justify-start text-destructive" onClick={logout} data-testid="mobile-logout">
              <LogOut className="mr-3 h-5 w-5" />
              Logout
            </Button>
          </nav>
        )}
      </header>

      <div className="flex">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex flex-col w-64 border-r bg-card min-h-screen sticky top-0">
          <div className="p-6">
            <h1 className="font-heading font-black text-2xl text-primary">Dolaglobo</h1>
            <p className="text-sm text-muted-foreground">Finance for Growth</p>
          </div>
          
          <nav className="flex-1 px-4 space-y-1">
            {navItems.map((item) => (
              <Button
                key={item.path}
                variant={location.pathname === item.path ? "secondary" : "ghost"}
                className="w-full justify-start"
                onClick={() => navigate(item.path)}
                data-testid={`nav-${item.label.toLowerCase()}`}
              >
                <item.icon className="mr-3 h-5 w-5" />
                {item.label}
              </Button>
            ))}
          </nav>
          
          <div className="p-4 border-t space-y-1">
            <Button variant="ghost" className="w-full justify-start" onClick={() => navigate("/profile")} data-testid="nav-profile">
              <User className="mr-3 h-5 w-5" />
              Profile
            </Button>
            <Button variant="ghost" className="w-full justify-start text-destructive hover:text-destructive" onClick={logout} data-testid="nav-logout">
              <LogOut className="mr-3 h-5 w-5" />
              Logout
            </Button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t md:hidden z-40">
        <div className="flex justify-around py-2">
          {navItems.slice(0, 5).map((item) => (
            <Button
              key={item.path}
              variant="ghost"
              size="sm"
              className={`flex-col h-auto py-2 ${location.pathname === item.path ? "text-primary" : "text-muted-foreground"}`}
              onClick={() => navigate(item.path)}
              data-testid={`bottom-nav-${item.label.toLowerCase()}`}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-xs mt-1">{item.label}</span>
            </Button>
          ))}
        </div>
      </nav>
    </div>
  );
};

const DashboardPage = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [systemSettings, setSystemSettings] = useState(null);
  const [balanceHidden, setBalanceHidden] = useState(() => {
    return localStorage.getItem('hideBalance') === 'true';
  });

  const toggleBalanceVisibility = () => {
    const newValue = !balanceHidden;
    setBalanceHidden(newValue);
    localStorage.setItem('hideBalance', newValue.toString());
  };

  const formatBalance = (amount) => {
    if (balanceHidden) {
      return '••••••';
    }
    return `KES ${(amount ?? 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
  };

  const formatBalanceShort = (amount) => {
    if (balanceHidden) {
      return '••••';
    }
    return `KES ${(amount ?? 0).toLocaleString()}`;
  };

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await apiCall("GET", "/user/dashboard", null, token);
        setData(res);
      } catch (err) {
        // Only show error if we don't have cached data
        if (!data) {
          toast.error("Failed to load dashboard data");
        }
        console.error("Failed to load dashboard:", err);
      } finally {
        setLoading(false);
      }
    };
    
    const fetchSettings = async () => {
      try {
        const res = await axios.get(`${API}/system/settings`);
        setSystemSettings(res.data);
      } catch (err) {
        console.error("Failed to fetch system settings", err);
      }
    };
    
    fetchDashboard();
    fetchSettings();
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const quickActions = [
    { icon: Smartphone, label: "MPESA", action: () => navigate("/deposit") },
    { icon: Send, label: "Withdraw", action: () => navigate("/withdraw") },
    { icon: PiggyBank, label: "Save", action: () => navigate("/savings") },
    { icon: CreditCard, label: "Loan", action: () => navigate("/loans") },
  ];

  return (
    <div className="space-y-6" data-testid="user-dashboard">
      {/* Welcome */}
      <div className="animate-fade-in flex items-center justify-between">
        <div>
          <h2 className="font-heading text-3xl font-bold">Hello, {data?.user?.name?.split(" ")[0]}!</h2>
          <p className="text-muted-foreground">Here's your financial overview</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleBalanceVisibility}
          className="text-muted-foreground hover:text-foreground"
          data-testid="dashboard-toggle-balance-btn"
        >
          {balanceHidden ? (
            <>
              <Eye className="h-4 w-4 mr-2" />
              Show
            </>
          ) : (
            <>
              <EyeOff className="h-4 w-4 mr-2" />
              Hide
            </>
          )}
        </Button>
      </div>

      {/* KYC Alert */}
      {data?.user?.kyc_status !== "approved" && (
        <Card className="border-amber-200 bg-amber-50 animate-fade-in stagger-1" data-testid="kyc-alert">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="h-6 w-6 text-amber-600" />
                <div>
                  <p className="font-semibold text-amber-800">Complete KYC Verification</p>
                  <p className="text-sm text-amber-700">Required to access loans and savings</p>
                </div>
              </div>
              <Button size="sm" onClick={() => navigate("/profile")} data-testid="complete-kyc-btn">
                Complete
              </Button>
            </div>
            {systemSettings?.kyc_email && (
              <div className="flex items-center gap-2 bg-amber-100/50 rounded-lg p-2 text-sm">
                <Send className="h-4 w-4 text-amber-700" />
                <span className="text-amber-800">Or email documents to: </span>
                <span className="font-mono font-medium text-amber-900">{systemSettings.kyc_email}</span>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 w-6 p-0 hover:bg-amber-200"
                  onClick={() => {
                    navigator.clipboard.writeText(systemSettings.kyc_email);
                    toast.success("Email copied!");
                  }}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Balance Card */}
      <Card className="bg-gradient-to-br from-primary to-emerald-700 text-white overflow-hidden animate-fade-in stagger-2" data-testid="balance-card">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-1">
            <p className="text-emerald-100">Available Balance</p>
            <button 
              onClick={toggleBalanceVisibility}
              className="text-emerald-200 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10"
              data-testid="balance-card-toggle"
            >
              {balanceHidden ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
            </button>
          </div>
          <h3 className="font-heading text-4xl font-black tabular-nums" data-testid="dashboard-wallet-balance">
            {formatBalance(data?.summary?.available_balance ?? data?.summary?.wallet_balance ?? 0)}
          </h3>
          {(data?.summary?.held_balance > 0) && (
            <p className="text-xs text-emerald-200 mt-1">
              Actual: {formatBalance(data?.summary?.wallet_balance || 0)} • Held: {formatBalance(data?.summary?.held_balance || 0)}
            </p>
          )}
          <div className="grid grid-cols-3 gap-4 mt-6 pt-4 border-t border-white/20">
            <div>
              <p className="text-xs text-emerald-100">Savings</p>
              <p className="font-bold tabular-nums" data-testid="dashboard-savings">{formatBalanceShort(data?.summary?.total_savings || 0)}</p>
            </div>
            <div>
              <p className="text-xs text-emerald-100">MMF</p>
              <p className="font-bold tabular-nums" data-testid="dashboard-mmf">{formatBalanceShort(data?.summary?.mmf_balance || 0)}</p>
            </div>
            <div>
              <p className="text-xs text-emerald-100">Loans</p>
              <p className="font-bold tabular-nums" data-testid="dashboard-loans">{formatBalanceShort(data?.summary?.total_loan_balance || 0)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-4 gap-3 animate-fade-in stagger-3">
        {quickActions.map((action, i) => (
          <Button
            key={i}
            variant="outline"
            className="flex-col h-auto py-4 hover:border-primary/50 hover:bg-primary/5"
            onClick={action.action}
            data-testid={`quick-action-${action.label.toLowerCase()}`}
          >
            <action.icon className="h-6 w-6 mb-2" />
            <span className="text-xs">{action.label}</span>
          </Button>
        ))}
      </div>

      {/* Recent Transactions */}
      <Card className="animate-fade-in stagger-4" data-testid="recent-transactions">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Recent Activity</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => navigate("/wallet")} data-testid="view-all-transactions">
            View All <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </CardHeader>
        <CardContent>
          {data?.recent_transactions?.length > 0 ? (
            <div className="space-y-3">
              {data.recent_transactions.map((txn, i) => {
                // Credit transactions (money coming IN) = GREEN
                const isCreditTransaction = 
                  txn.type.includes("deposit") || 
                  txn.type.includes("disbursement") || 
                  txn.type.includes("interest") || 
                  txn.type.includes("refund") ||
                  txn.type.includes("credit") ||
                  txn.type === "mmf_interest" ||
                  txn.type === "lock_savings_interest";
                
                return (
                  <div key={i} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${isCreditTransaction ? "bg-green-100" : "bg-red-100"}`}>
                        {isCreditTransaction ? (
                          <ArrowDownLeft className="h-4 w-4 text-green-600" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4 text-red-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{txn.description}</p>
                        <p className="text-xs text-muted-foreground">{new Date(txn.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <p className={`font-semibold tabular-nums ${isCreditTransaction ? "text-green-600" : "text-red-600"}`}>
                      {isCreditTransaction ? "+" : "-"}KES {txn.amount?.toLocaleString()}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">No transactions yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// ================== WALLET PAGE ==================

const WalletPage = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [balanceHidden, setBalanceHidden] = useState(() => {
    // Load preference from localStorage
    return localStorage.getItem('hideBalance') === 'true';
  });

  const toggleBalanceVisibility = () => {
    const newValue = !balanceHidden;
    setBalanceHidden(newValue);
    localStorage.setItem('hideBalance', newValue.toString());
  };

  const formatBalance = (amount) => {
    if (balanceHidden) {
      return '••••••';
    }
    return `KES ${(amount ?? 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}`;
  };

  const fetchData = async (showError = true) => {
    try {
      const [walletRes, txnRes] = await Promise.all([
        apiCall("GET", "/wallet", null, token),
        apiCall("GET", "/transactions?limit=50", null, token)
      ]);
      setWallet(walletRes);
      setTransactions(txnRes.transactions);
    } catch (err) {
      if (showError) {
        toast.error("Failed to load wallet data");
      }
      console.error("Failed to load wallet:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="wallet-page">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-3xl font-bold">Wallet</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleBalanceVisibility}
          className="text-muted-foreground hover:text-foreground"
          data-testid="toggle-balance-btn"
        >
          {balanceHidden ? (
            <>
              <Eye className="h-4 w-4 mr-2" />
              Show Balance
            </>
          ) : (
            <>
              <EyeOff className="h-4 w-4 mr-2" />
              Hide Balance
            </>
          )}
        </Button>
      </div>

      {/* Balance Card */}
      <Card className="bg-gradient-to-br from-primary to-emerald-700 text-white" data-testid="wallet-balance-card">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <p className="text-emerald-100">Available Balance</p>
                <button 
                  onClick={toggleBalanceVisibility}
                  className="text-emerald-200 hover:text-white transition-colors"
                  data-testid="toggle-balance-icon"
                >
                  {balanceHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
              </div>
              <h3 className="font-heading text-4xl font-black tabular-nums" data-testid="available-balance">
                {formatBalance(wallet?.available_balance ?? wallet?.balance)}
              </h3>
              {wallet?.withheld_amount > 0 && (
                <p className="text-emerald-200 text-sm mt-2" data-testid="actual-balance">
                  Actual Balance: {formatBalance(wallet?.actual_balance ?? wallet?.balance)}
                </p>
              )}
            </div>
            {wallet?.withheld_amount > 0 && (
              <div className="bg-white/10 rounded-lg p-4">
                <p className="text-emerald-100 text-sm mb-1">Amount on Hold</p>
                <p className="font-bold text-xl tabular-nums text-yellow-300" data-testid="withheld-amount">
                  {formatBalance(wallet?.withheld_amount)}
                </p>
                <p className="text-emerald-200 text-xs mt-1">
                  This amount is held for fees or processing
                </p>
              </div>
            )}
          </div>
          <div className="mt-6">
            <Button 
              className="bg-white text-primary hover:bg-white/90" 
              data-testid="deposit-btn"
              onClick={() => navigate("/deposit")}
            >
              <Plus className="h-4 w-4 mr-2" />
              Deposit via MPESA
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Transactions */}
      <Card data-testid="transactions-list">
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            {transactions.length > 0 ? (
              <div className="space-y-3">
                {transactions.map((txn, i) => {
                  // Credit transactions (money coming IN) = GREEN
                  const isCreditTransaction = 
                    txn.type.includes("deposit") || 
                    txn.type.includes("disbursement") || 
                    txn.type.includes("interest") || 
                    txn.type.includes("refund") ||
                    txn.type.includes("credit") ||
                    txn.type === "mmf_interest" ||
                    txn.type === "lock_savings_interest";
                  
                  return (
                    <div key={i} className="flex items-center justify-between py-3 border-b last:border-0">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${isCreditTransaction ? "bg-green-100" : "bg-red-100"}`}>
                          {isCreditTransaction ? (
                            <ArrowDownLeft className="h-4 w-4 text-green-600" />
                          ) : (
                            <ArrowUpRight className="h-4 w-4 text-red-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{txn.description}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(txn.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold tabular-nums ${isCreditTransaction ? "text-green-600" : "text-red-600"}`}>
                          {isCreditTransaction ? "+" : "-"}KES {txn.amount?.toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          Bal: KES {txn.balance_after?.toLocaleString() || "N/A"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">No transactions yet</p>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

// ================== SAVINGS PAGE ==================

const SavingsPage = () => {
  const { token, user } = useAuth();
  const [savings, setSavings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [term, setTerm] = useState("6");
  const [balanceHidden, setBalanceHidden] = useState(() => {
    return localStorage.getItem('hideBalance') === 'true';
  });

  const toggleBalanceVisibility = () => {
    const newValue = !balanceHidden;
    setBalanceHidden(newValue);
    localStorage.setItem('hideBalance', newValue.toString());
  };

  const formatBalance = (amount) => {
    if (balanceHidden) return '••••••';
    return `KES ${(amount ?? 0).toLocaleString()}`;
  };

  const fetchSavings = async (showError = true) => {
    try {
      const res = await apiCall("GET", "/savings", null, token);
      setSavings(res);
    } catch (err) {
      if (showError) {
        toast.error("Failed to load savings");
      }
      console.error("Failed to load savings:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSavings();
  }, [token]);

  const handleCreateSavings = async () => {
    if (!amount || parseFloat(amount) < 1000) {
      toast.error("Minimum amount is KES 1,000");
      return;
    }
    try {
      await apiCall("POST", "/savings/create", {
        amount: parseFloat(amount),
        term_months: parseInt(term)
      }, token);
      toast.success("Lock savings created!");
      setCreateOpen(false);
      setAmount("");
      fetchSavings(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create savings");
    }
  };

  const handleWithdraw = async (savingsId) => {
    if (!window.confirm("Are you sure? Early withdrawal may incur penalties.")) return;
    try {
      const res = await apiCall("POST", `/savings/${savingsId}/withdraw`, null, token);
      toast.success(`Withdrawn KES ${res.total_payout.toLocaleString()}`);
      fetchSavings(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Withdrawal failed");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const activeSavings = savings.filter(s => s.status === "active");
  const totalValue = activeSavings.reduce((sum, s) => sum + (s.current_value || s.amount), 0);

  return (
    <div className="space-y-6" data-testid="savings-page">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="font-heading text-3xl font-bold">Lock Savings</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleBalanceVisibility}
            className="text-muted-foreground hover:text-foreground"
            data-testid="savings-toggle-balance"
          >
            {balanceHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </Button>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="create-savings-btn">
              <Plus className="h-4 w-4 mr-2" />
              New Savings
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Lock Savings</DialogTitle>
              <DialogDescription>Lock your funds and earn interest</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Amount (KES)</Label>
                <Input
                  type="number"
                  placeholder="Minimum 1,000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  data-testid="savings-amount-input"
                />
              </div>
              <div className="space-y-2">
                <Label>Lock Period</Label>
                <Select value={term} onValueChange={setTerm}>
                  <SelectTrigger data-testid="savings-term-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3 Months (8% p.a.)</SelectItem>
                    <SelectItem value="6">6 Months (9.5% p.a.)</SelectItem>
                    <SelectItem value="9">9 Months (10.5% p.a.)</SelectItem>
                    <SelectItem value="12">12 Months (12% p.a.)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateSavings} data-testid="confirm-savings-btn">Create Savings</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Total Card */}
      <Card className="bg-secondary" data-testid="total-savings-card">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="p-4 bg-primary/10 rounded-full">
              <PiggyBank className="h-8 w-8 text-primary" />
            </div>
            <div>
              <p className="text-muted-foreground">Total Locked Savings</p>
              <h3 className="font-heading text-3xl font-bold tabular-nums" data-testid="total-savings-value">
                {formatBalance(totalValue)}
              </h3>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Savings List */}
      {activeSavings.length > 0 ? (
        <div className="grid gap-4">
          {activeSavings.map((saving, i) => {
            const maturityDate = new Date(saving.maturity_date);
            const startDate = new Date(saving.start_date);
            const now = new Date();
            const totalDays = (maturityDate - startDate) / (1000 * 60 * 60 * 24);
            const elapsedDays = (now - startDate) / (1000 * 60 * 60 * 24);
            const progress = Math.min(100, (elapsedDays / totalDays) * 100);

            return (
              <Card key={i} data-testid={`savings-item-${i}`}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="font-semibold">{saving.term_months}-Month Lock Savings</p>
                      <p className="text-sm text-muted-foreground">{saving.interest_rate}% p.a.</p>
                    </div>
                    <Badge variant="secondary" className="bg-primary/10 text-primary">
                      Active
                    </Badge>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Principal</span>
                      <span className="font-semibold tabular-nums">{formatBalance(saving.amount)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Current Value</span>
                      <span className="font-semibold tabular-nums text-green-600">
                        {formatBalance(saving.current_value || saving.amount)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Matures</span>
                      <span className="font-semibold">{maturityDate.toLocaleDateString()}</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Progress</span>
                        <span>{Math.round(progress)}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full mt-4"
                    onClick={() => handleWithdraw(saving.id)}
                    data-testid={`withdraw-savings-${i}`}
                  >
                    Withdraw {progress < 100 && "(Early - 0.5% penalty)"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <PiggyBank className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No active savings</p>
            <p className="text-sm text-muted-foreground mt-1">Create a lock savings to start earning interest</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// ================== MMF PAGE ==================

const MMFPage = () => {
  const { token } = useAuth();
  const [mmf, setMmf] = useState(null);
  const [loading, setLoading] = useState(true);
  const [investOpen, setInvestOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [amount, setAmount] = useState("");

  const fetchMMF = async (showError = true) => {
    try {
      const res = await apiCall("GET", "/mmf", null, token);
      setMmf(res);
    } catch (err) {
      if (showError) {
        toast.error("Failed to load MMF data");
      }
      console.error("Failed to load MMF:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMMF();
  }, [token]);

  const handleInvest = async () => {
    if (!amount || parseFloat(amount) < 100) {
      toast.error("Minimum investment is KES 100");
      return;
    }
    try {
      await apiCall("POST", "/mmf/invest", { amount: parseFloat(amount) }, token);
      toast.success("Investment successful!");
      setInvestOpen(false);
      setAmount("");
      fetchMMF(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Investment failed");
    }
  };

  const handleWithdraw = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    try {
      await apiCall("POST", "/mmf/withdraw", { amount: parseFloat(amount) }, token);
      toast.success("Withdrawal successful!");
      setWithdrawOpen(false);
      setAmount("");
      fetchMMF(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Withdrawal failed");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="mmf-page">
      <h2 className="font-heading text-3xl font-bold">Money Market Fund</h2>

      <Card className="bg-gradient-to-br from-accent/20 to-accent/5 border-accent/20" data-testid="mmf-card">
        <CardContent className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="p-4 bg-accent/20 rounded-full">
              <TrendingUp className="h-8 w-8 text-accent" />
            </div>
            <div>
              <p className="text-muted-foreground">Current Balance</p>
              <h3 className="font-heading text-4xl font-black tabular-nums">
                KES {(mmf?.balance || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
              </h3>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-4 bg-card rounded-lg">
              <p className="text-sm text-muted-foreground">Total Invested</p>
              <p className="font-bold tabular-nums text-lg">
                KES {(mmf?.total_invested || 0).toLocaleString()}
              </p>
            </div>
            <div className="p-4 bg-card rounded-lg">
              <p className="text-sm text-muted-foreground">Interest Rate</p>
              <p className="font-bold text-lg text-green-600">{mmf?.interest_rate || 10}% p.a.</p>
            </div>
          </div>

          <div className="flex gap-3">
            <Dialog open={investOpen} onOpenChange={setInvestOpen}>
              <DialogTrigger asChild>
                <Button className="flex-1" data-testid="invest-mmf-btn">
                  <Plus className="h-4 w-4 mr-2" />
                  Invest
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Invest in MMF</DialogTitle>
                  <DialogDescription>Earn daily compound interest</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Amount (KES)</Label>
                    <Input
                      type="number"
                      placeholder="Minimum 100"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      data-testid="mmf-invest-amount"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setInvestOpen(false)}>Cancel</Button>
                  <Button onClick={handleInvest} data-testid="confirm-invest-btn">Invest</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="flex-1" data-testid="withdraw-mmf-btn">
                  <Minus className="h-4 w-4 mr-2" />
                  Withdraw
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Withdraw from MMF</DialogTitle>
                  <DialogDescription>Available: KES {(mmf?.balance || 0).toLocaleString()}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Amount (KES)</Label>
                    <Input
                      type="number"
                      placeholder="Amount to withdraw"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      data-testid="mmf-withdraw-amount"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setWithdrawOpen(false)}>Cancel</Button>
                  <Button onClick={handleWithdraw} data-testid="confirm-withdraw-btn">Withdraw</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">About Money Market Fund</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>• Daily compound interest calculated on your balance</p>
          <p>• No lock-in period - withdraw anytime</p>
          <p>• Minimum investment: KES 100</p>
          <p>• Interest credited daily to your MMF balance</p>
        </CardContent>
      </Card>
    </div>
  );
};

// ================== LOANS PAGE ==================

const LoansPage = () => {
  const { token, user } = useAuth();
  const [loans, setLoans] = useState([]);
  const [loanInfo, setLoanInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [applyOpen, setApplyOpen] = useState(false);
  const [formData, setFormData] = useState({
    loan_type: "short_term",
    amount: "",
    term_months: "3",
    purpose: ""
  });

  const fetchData = async (showError = true) => {
    try {
      const [loansRes, infoRes] = await Promise.all([
        apiCall("GET", "/loans", null, token),
        apiCall("GET", "/loans/info", null, token)
      ]);
      setLoans(loansRes);
      setLoanInfo(infoRes);
    } catch (err) {
      if (showError) {
        toast.error("Failed to load loans data");
      }
      console.error("Failed to load loans:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const handleApply = async () => {
    if (!formData.amount || parseFloat(formData.amount) < 1000) {
      toast.error("Minimum loan amount is KES 1,000");
      return;
    }
    if (loanInfo?.loan_limit && parseFloat(formData.amount) > loanInfo.loan_limit) {
      toast.error(`Amount exceeds your loan limit of KES ${loanInfo.loan_limit.toLocaleString()}`);
      return;
    }
    if (!formData.purpose) {
      toast.error("Please provide loan purpose");
      return;
    }
    try {
      await apiCall("POST", "/loans/apply", {
        loan_type: formData.loan_type,
        amount: parseFloat(formData.amount),
        term_months: parseInt(formData.term_months),
        purpose: formData.purpose
      }, token);
      toast.success("Loan application submitted!");
      setApplyOpen(false);
      setFormData({ loan_type: "short_term", amount: "", term_months: "3", purpose: "" });
      fetchData(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Application failed");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const activeLoan = loans.find(l => l.status === "disbursed");
  const pendingLoan = loans.find(l => l.status === "pending");
  const canApply = loanInfo?.can_apply;

  return (
    <div className="space-y-6" data-testid="loans-page">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-3xl font-bold">Loans</h2>
        {canApply && (
          <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
            <DialogTrigger asChild>
              <Button data-testid="apply-loan-btn">
                <Plus className="h-4 w-4 mr-2" />
                Apply for Loan
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Apply for Loan</DialogTitle>
                <DialogDescription>
                  Your loan limit: <strong>KES {(loanInfo?.loan_limit || 0).toLocaleString()}</strong>
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Loan Type</Label>
                  <Select value={formData.loan_type} onValueChange={(v) => setFormData({ ...formData, loan_type: v })}>
                    <SelectTrigger data-testid="loan-type-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="short_term">Short-term (1-6 months, 15% p.a.)</SelectItem>
                      <SelectItem value="long_term">Long-term (6-36 months, 18% p.a.)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Amount (KES)</Label>
                  <Input
                    type="number"
                    placeholder={`Max: ${(loanInfo?.loan_limit || 0).toLocaleString()}`}
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    max={loanInfo?.loan_limit || 0}
                    data-testid="loan-amount-input"
                  />
                  {formData.amount && parseFloat(formData.amount) > (loanInfo?.loan_limit || 0) && (
                    <p className="text-xs text-red-500">Amount exceeds your limit</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Term (Months)</Label>
                  <Select value={formData.term_months} onValueChange={(v) => setFormData({ ...formData, term_months: v })}>
                    <SelectTrigger data-testid="loan-term-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {formData.loan_type === "short_term" ? (
                        <>
                          <SelectItem value="1">1 Month</SelectItem>
                          <SelectItem value="3">3 Months</SelectItem>
                          <SelectItem value="6">6 Months</SelectItem>
                        </>
                      ) : (
                        <>
                          <SelectItem value="6">6 Months</SelectItem>
                          <SelectItem value="12">12 Months</SelectItem>
                          <SelectItem value="24">24 Months</SelectItem>
                          <SelectItem value="36">36 Months</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Purpose</Label>
                  <Input
                    placeholder="e.g., Business inventory"
                    value={formData.purpose}
                    onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                    data-testid="loan-purpose-input"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setApplyOpen(false)}>Cancel</Button>
                <Button onClick={handleApply} data-testid="submit-loan-btn">Submit Application</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Loan Limit Card */}
      <Card className="bg-gradient-to-br from-purple-600 to-indigo-700 text-white" data-testid="loan-limit-card">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 mb-1">Your Loan Limit</p>
              <h3 className="font-heading text-4xl font-black tabular-nums">
                KES {(loanInfo?.loan_limit || 0).toLocaleString()}
              </h3>
              {loanInfo?.loan_limit > 0 ? (
                <p className="text-purple-200 text-sm mt-2">You can apply for loans up to this amount</p>
              ) : (
                <p className="text-purple-200 text-sm mt-2">
                  {loanInfo?.kyc_status !== "approved" 
                    ? "Complete KYC verification to get a loan limit" 
                    : "Your loan limit is being processed"}
                </p>
              )}
            </div>
            <CreditCard className="h-16 w-16 text-purple-300 opacity-50" />
          </div>
          {loanInfo?.repaid_loans > 0 && (
            <div className="mt-4 pt-4 border-t border-purple-400/30">
              <p className="text-sm text-purple-200">
                Loan History: {loanInfo.repaid_loans} repaid of {loanInfo.total_loans} total loans
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status Messages */}
      {!canApply && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-amber-800">
              <AlertCircle className="h-5 w-5" />
              <div>
                {loanInfo?.kyc_status !== "approved" ? (
                  <p>Complete KYC verification to apply for loans</p>
                ) : loanInfo?.loan_limit === 0 ? (
                  <p>Your loan limit is being processed. Please check back later.</p>
                ) : loanInfo?.has_active_loan ? (
                  <p>You have an active loan. Repay it to apply for a new one.</p>
                ) : (
                  <p>You cannot apply for a loan at this time.</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Loan */}
      {pendingLoan && (
        <Card className="border-amber-300 bg-amber-50" data-testid="pending-loan-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Pending Application</CardTitle>
              <Badge className="bg-amber-100 text-amber-800">Under Review</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Requested Amount</p>
                <p className="font-bold tabular-nums">KES {pendingLoan.amount.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Term</p>
                <p className="font-bold">{pendingLoan.term_months} months</p>
              </div>
            </div>
            <p className="text-sm text-amber-700 mt-4">Your loan application is under review.</p>
          </CardContent>
        </Card>
      )}

      {/* Active Loan */}
      {activeLoan && (
        <ActiveLoanCard 
          loan={activeLoan} 
          token={token}
          onRepaymentSubmitted={fetchData}
        />
      )}

      {/* Loan History */}
      {loans.length > 0 && (
        <Card data-testid="loan-history">
          <CardHeader>
            <CardTitle className="text-lg">Loan History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {loans.map((loan, i) => (
                <div key={i} className="flex items-center justify-between py-3 border-b last:border-0">
                  <div>
                    <p className="font-medium">{loan.loan_type?.replace("_", " ").toUpperCase()}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(loan.created_at).toLocaleDateString()} • {loan.term_months} months
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold tabular-nums">KES {loan.amount?.toLocaleString()}</p>
                    <Badge variant={
                      loan.status === "disbursed" ? "default" :
                      loan.status === "pending" ? "secondary" :
                      loan.status === "repaid" ? "outline" : "destructive"
                    }>
                      {loan.status === "repaid" ? "Fully Repaid" : loan.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!activeLoan && !pendingLoan && loans.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No loan history</p>
            <p className="text-sm text-muted-foreground mt-1">Apply for a loan to grow your business</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// Active Loan Card Component with Repayment System
const ActiveLoanCard = ({ loan, token, onRepaymentSubmitted }) => {
  const [repayOpen, setRepayOpen] = useState(false);
  const [repayMethod, setRepayMethod] = useState("wallet");
  const [repayAmount, setRepayAmount] = useState("");
  const [mpesaRef, setMpesaRef] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [repayments, setRepayments] = useState([]);
  const [paybillInfo, setPaybillInfo] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchRepayments = async () => {
      try {
        const [repRes, paybillRes] = await Promise.all([
          apiCall("GET", `/loans/${loan.id}/repayments`, null, token),
          apiCall("GET", "/mpesa/repayment-info", null, token)
        ]);
        setRepayments(repRes.repayments || []);
        setPaybillInfo(paybillRes);
      } catch (err) {
        console.error("Failed to fetch repayment data");
      }
    };
    fetchRepayments();
  }, [loan.id, token]);

  const handleSubmitRepayment = async () => {
    if (!repayAmount || parseFloat(repayAmount) <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (repayMethod === "mpesa" && !mpesaRef) {
      toast.error("MPESA reference is required");
      return;
    }

    setSubmitting(true);
    try {
      await apiCall("POST", `/loans/${loan.id}/repay`, {
        amount: parseFloat(repayAmount),
        repayment_method: repayMethod,
        mpesa_ref: repayMethod === "mpesa" ? mpesaRef : null,
        sender_phone: repayMethod === "mpesa" ? senderPhone : null
      }, token);
      toast.success("Repayment submitted for approval");
      setRepayOpen(false);
      setRepayAmount("");
      setMpesaRef("");
      setSenderPhone("");
      onRepaymentSubmitted();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to submit repayment");
    } finally {
      setSubmitting(false);
    }
  };

  const pendingRepayments = repayments.filter(r => r.status === "pending");
  const totalPaid = loan.total_paid || 0;

  return (
    <Card className="border-primary" data-testid="active-loan-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Active Loan</CardTitle>
          <Badge className="bg-green-100 text-green-800">Disbursed</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Loan Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Loan Amount</p>
            <p className="font-bold tabular-nums">KES {loan.amount?.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Due</p>
            <p className="font-bold tabular-nums">KES {loan.total_repayment?.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Paid</p>
            <p className="font-bold tabular-nums text-green-600">KES {totalPaid.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Outstanding</p>
            <p className="font-bold tabular-nums text-red-600">
              KES {loan.outstanding_balance?.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Repayment Progress</span>
            <span className="font-medium">{Math.round((totalPaid / loan.total_repayment) * 100)}%</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2">
            <div 
              className="bg-primary h-2 rounded-full transition-all" 
              style={{ width: `${Math.min(100, (totalPaid / loan.total_repayment) * 100)}%` }}
            />
          </div>
        </div>

        {/* Pending Repayments Alert */}
        {pendingRepayments.length > 0 && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              <span>{pendingRepayments.length} repayment(s) pending</span>
            </p>
          </div>
        )}

        <Separator />

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Dialog open={repayOpen} onOpenChange={setRepayOpen}>
            <DialogTrigger asChild>
              <Button className="flex-1" data-testid="repay-loan-btn">
                <Banknote className="h-4 w-4 mr-2" />
                Make Repayment
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Loan Repayment</DialogTitle>
                <DialogDescription>
                  Outstanding balance: <strong>KES {loan.outstanding_balance?.toLocaleString()}</strong>
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {/* Repayment Method */}
                <div className="space-y-2">
                  <Label>Repayment Method</Label>
                  <Tabs value={repayMethod} onValueChange={setRepayMethod}>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="wallet">
                        <Wallet className="h-4 w-4 mr-2" />
                        Wallet
                      </TabsTrigger>
                      <TabsTrigger value="mpesa">
                        <Smartphone className="h-4 w-4 mr-2" />
                        MPESA
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="wallet" className="mt-4 space-y-4">
                      <div className="space-y-2">
                        <Label>Amount (KES)</Label>
                        <Input
                          type="number"
                          placeholder="Enter amount"
                          value={repayAmount}
                          onChange={(e) => setRepayAmount(e.target.value)}
                          data-testid="repay-amount-input"
                        />
                        <p className="text-xs text-muted-foreground">Amount will be deducted from your wallet upon confirmation</p>
                      </div>
                    </TabsContent>

                    <TabsContent value="mpesa" className="mt-4 space-y-4">
                      {/* MPESA Instructions */}
                      <div className="p-3 bg-primary/5 border rounded-lg">
                        <p className="text-sm font-medium mb-2">Send payment to:</p>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <p className="text-muted-foreground">Paybill</p>
                            <p className="font-bold">{paybillInfo?.paybill_number}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Account No.</p>
                            <p className="font-bold">{paybillInfo?.account_number}</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Amount Sent (KES)</Label>
                        <Input
                          type="number"
                          placeholder="Enter amount"
                          value={repayAmount}
                          onChange={(e) => setRepayAmount(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>MPESA Reference Code</Label>
                        <Input
                          placeholder="e.g., RKJ4XYZ123"
                          value={mpesaRef}
                          onChange={(e) => setMpesaRef(e.target.value.toUpperCase())}
                        />
                        <p className="text-xs text-muted-foreground">From your MPESA confirmation SMS</p>
                      </div>
                      <div className="space-y-2">
                        <Label>Sender Phone (Optional)</Label>
                        <Input
                          placeholder="0712345678"
                          value={senderPhone}
                          onChange={(e) => setSenderPhone(e.target.value)}
                        />
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>

                {/* Info about partial/overpayment */}
                {repayAmount && parseFloat(repayAmount) > 0 && (
                  <div className={`p-3 rounded-lg ${
                    parseFloat(repayAmount) < loan.outstanding_balance 
                      ? "bg-blue-50 border-blue-200" 
                      : parseFloat(repayAmount) > loan.outstanding_balance
                        ? "bg-amber-50 border-amber-200"
                        : "bg-green-50 border-green-200"
                  } border`}>
                    <p className="text-sm">
                      {parseFloat(repayAmount) < loan.outstanding_balance ? (
                        <span className="text-blue-800">Partial payment - Remaining after: KES {(loan.outstanding_balance - parseFloat(repayAmount)).toLocaleString()}</span>
                      ) : parseFloat(repayAmount) > loan.outstanding_balance ? (
                        <span className="text-amber-800">Overpayment - Excess amount will be processed after approval</span>
                      ) : (
                        <span className="text-green-800">Full repayment - This will clear your loan</span>
                      )}
                    </p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRepayOpen(false)}>Cancel</Button>
                <Button onClick={handleSubmitRepayment} disabled={submitting}>
                  {submitting ? "Submitting..." : "Submit Repayment"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button variant="outline" onClick={() => setShowHistory(!showHistory)}>
            <FileText className="h-4 w-4 mr-2" />
            {showHistory ? "Hide" : "History"}
          </Button>
        </div>

        {/* Repayment History */}
        {showHistory && repayments.length > 0 && (
          <div className="space-y-2 pt-4 border-t">
            <p className="font-semibold text-sm">Repayment History</p>
            <div className="space-y-2 max-h-[200px] overflow-y-auto">
              {repayments.map((rep, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg text-sm">
                  <div>
                    <p className="font-medium">KES {rep.amount?.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">
                      {rep.repayment_method === "mpesa" ? `MPESA: ${rep.mpesa_ref}` : "Wallet"} • {new Date(rep.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge className={
                    rep.status === "approved" ? "bg-green-100 text-green-800" :
                    rep.status === "pending" ? "bg-amber-100 text-amber-800" :
                    "bg-red-100 text-red-800"
                  }>
                    {rep.status === "approved" ? "Approved" : rep.status === "pending" ? "Pending" : "Rejected"}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ================== NOTIFICATIONS PAGE ==================

const NotificationsPage = () => {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = async () => {
    try {
      const res = await apiCall("GET", "/notifications", null, token);
      setNotifications(res);
    } catch (err) {
      toast.error("Failed to load notifications");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [token]);

  const handleMarkRead = async (id) => {
    try {
      await apiCall("PUT", `/notifications/${id}/read`, null, token);
      setNotifications(notifications.map(n => n.id === id ? { ...n, read: true } : n));
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiCall("PUT", "/notifications/read-all", null, token);
      setNotifications(notifications.map(n => ({ ...n, read: true })));
      toast.success("All notifications marked as read");
    } catch (err) {
      toast.error("Failed to mark as read");
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case "otp": return <Phone className="h-5 w-5" />;
      case "kyc": return <Shield className="h-5 w-5" />;
      case "loan": return <CreditCard className="h-5 w-5" />;
      case "savings": return <PiggyBank className="h-5 w-5" />;
      default: return <Bell className="h-5 w-5" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="space-y-6" data-testid="notifications-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-3xl font-bold">Notifications</h2>
          {unreadCount > 0 && (
            <p className="text-muted-foreground">{unreadCount} unread</p>
          )}
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={handleMarkAllRead} data-testid="mark-all-read-btn">
            Mark all read
          </Button>
        )}
      </div>

      {notifications.length > 0 ? (
        <div className="space-y-3">
          {notifications.map((notification, i) => (
            <Card
              key={i}
              className={`cursor-pointer transition-all ${!notification.read ? "border-primary/50 bg-primary/5" : ""}`}
              onClick={() => handleMarkRead(notification.id)}
              data-testid={`notification-${i}`}
            >
              <CardContent className="p-4">
                <div className="flex gap-4">
                  <div className={`p-2 rounded-full ${!notification.read ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {getIcon(notification.type)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <p className="font-semibold">{notification.title}</p>
                      {!notification.read && (
                        <span className="w-2 h-2 bg-primary rounded-full" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{notification.message}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(notification.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No notifications yet</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// ================== PROFILE PAGE ==================

const ProfilePage = () => {
  const { token, user, setUser } = useAuth();
  const [kycStatus, setKycStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [kycOpen, setKycOpen] = useState(false);
  const [kycData, setKycData] = useState({
    id_type: "national_id",
    id_number: "",
    id_front_url: "",
    id_back_url: "",
    business_name: "",
    business_type: "",
    business_reg_url: ""
  });

  useEffect(() => {
    const fetchKYC = async () => {
      try {
        const res = await apiCall("GET", "/kyc/status", null, token);
        setKycStatus(res);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchKYC();
  }, [token]);

  const handleSubmitKYC = async () => {
    if (!kycData.id_number) {
      toast.error("ID number is required");
      return;
    }
    try {
      await apiCall("POST", "/kyc/submit", kycData, token);
      toast.success("KYC submitted successfully!");
      setKycOpen(false);
      // Refresh KYC status
      const res = await apiCall("GET", "/kyc/status", null, token);
      setKycStatus(res);
      setUser({ ...user, kyc_status: "submitted" });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to submit KYC");
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "approved": return <Badge className="bg-green-100 text-green-800">Approved</Badge>;
      case "submitted": return <Badge className="bg-amber-100 text-amber-800">Under Review</Badge>;
      case "rejected": return <Badge className="bg-red-100 text-red-800">Rejected</Badge>;
      default: return <Badge variant="secondary">Pending</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="profile-page">
      <h2 className="font-heading text-3xl font-bold">Profile</h2>

      {/* User Info */}
      <Card data-testid="user-info-card">
        <CardHeader>
          <CardTitle className="text-lg">Account Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
              <User className="h-8 w-8 text-primary" />
            </div>
            <div>
              <p className="font-semibold text-lg">{user?.name}</p>
              <p className="text-muted-foreground">{user?.phone}</p>
            </div>
          </div>
          <Separator />
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Phone Verified</p>
              <div className="flex items-center gap-2 mt-1">
                {user?.phone_verified ? (
                  <><CheckCircle2 className="h-4 w-4 text-green-600" /> Yes</>
                ) : (
                  <><XCircle className="h-4 w-4 text-red-600" /> No</>
                )}
              </div>
            </div>
            <div>
              <p className="text-muted-foreground">Member Since</p>
              <p className="mt-1">{new Date(user?.created_at).toLocaleDateString()}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KYC Section */}
      <Card data-testid="kyc-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">KYC Verification</CardTitle>
          {getStatusBadge(kycStatus?.kyc_status)}
        </CardHeader>
        <CardContent>
          {kycStatus?.kyc_status === "approved" ? (
            <div className="flex items-center gap-4 p-4 bg-green-50 rounded-lg">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
              <div>
                <p className="font-semibold text-green-800">KYC Verified</p>
                <p className="text-sm text-green-700">You have full access to all features</p>
              </div>
            </div>
          ) : kycStatus?.kyc_status === "submitted" ? (
            <div className="flex items-center gap-4 p-4 bg-amber-50 rounded-lg">
              <Clock className="h-8 w-8 text-amber-600" />
              <div>
                <p className="font-semibold text-amber-800">Under Review</p>
                <p className="text-sm text-amber-700">Your documents are being verified</p>
              </div>
            </div>
          ) : kycStatus?.kyc_status === "rejected" ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-red-50 rounded-lg">
                <XCircle className="h-8 w-8 text-red-600" />
                <div>
                  <p className="font-semibold text-red-800">KYC Rejected</p>
                  <p className="text-sm text-red-700">{kycStatus?.kyc_details?.admin_notes || "Please resubmit with correct documents"}</p>
                </div>
              </div>
              <Dialog open={kycOpen} onOpenChange={setKycOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full" data-testid="resubmit-kyc-btn">Resubmit KYC</Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Submit KYC Documents</DialogTitle>
                  </DialogHeader>
                  <KYCForm kycData={kycData} setKycData={setKycData} onSubmit={handleSubmitKYC} token={token} />
                </DialogContent>
              </Dialog>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                <Shield className="h-8 w-8 text-muted-foreground" />
                <div>
                  <p className="font-semibold">Complete KYC Verification</p>
                  <p className="text-sm text-muted-foreground">Required to access loans and savings products</p>
                </div>
              </div>
              <Dialog open={kycOpen} onOpenChange={setKycOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full" data-testid="submit-kyc-btn">Submit KYC</Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Submit KYC Documents</DialogTitle>
                  </DialogHeader>
                  <KYCForm kycData={kycData} setKycData={setKycData} onSubmit={handleSubmitKYC} token={token} />
                </DialogContent>
              </Dialog>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const KYCForm = ({ kycData, setKycData, onSubmit, token }) => {
  const [uploadMethod, setUploadMethod] = useState("upload"); // "upload" or "email"
  const [uploading, setUploading] = useState({});
  const [uploadedFiles, setUploadedFiles] = useState({});
  const [kycEmail, setKycEmail] = useState("");
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [confirmingEmail, setConfirmingEmail] = useState(false);
  
  useEffect(() => {
    // Fetch KYC email and check if already confirmed
    const fetchData = async () => {
      try {
        const [emailRes, statusRes] = await Promise.all([
          axios.get(`${API}/kyc/email-info`),
          token ? axios.get(`${API}/kyc/email-submission-status`, {
            headers: { Authorization: `Bearer ${token}` }
          }) : Promise.resolve({ data: { email_submitted: false } })
        ]);
        setKycEmail(emailRes.data.kyc_email);
        setEmailConfirmed(statusRes.data.email_submitted);
      } catch (err) {
        console.error("Failed to fetch KYC data", err);
      }
    };
    fetchData();
  }, [token]);

  const handleConfirmEmailSubmission = async () => {
    if (!kycData.id_number) {
      toast.error("Please enter your ID number first");
      return;
    }
    
    setConfirmingEmail(true);
    try {
      await axios.post(`${API}/kyc/confirm-email-submission`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEmailConfirmed(true);
      toast.success("Email submission confirmed! Our team will review your documents shortly.");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to confirm submission");
    } finally {
      setConfirmingEmail(false);
    }
  };

  const handleFileUpload = async (e, documentType) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Please upload a JPG, PNG, or PDF file");
      return;
    }
    
    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size must be less than 5MB");
      return;
    }
    
    setUploading(prev => ({ ...prev, [documentType]: true }));
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('document_type', documentType);
      
      const res = await axios.post(`${API}/kyc/upload-document`, formData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      
      setUploadedFiles(prev => ({ ...prev, [documentType]: res.data.document }));
      
      // Update kycData with the URL
      const urlField = documentType === 'id_front' ? 'id_front_url' : 
                       documentType === 'id_back' ? 'id_back_url' : 
                       documentType === 'business_reg' ? 'business_reg_url' : null;
      if (urlField) {
        setKycData(prev => ({ ...prev, [urlField]: res.data.document.url }));
      }
      
      toast.success(`${documentType.replace('_', ' ')} uploaded successfully!`);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(prev => ({ ...prev, [documentType]: false }));
    }
  };

  const FileUploadBox = ({ documentType, label, required = false }) => (
    <div className="space-y-2">
      <Label>{label} {required && <span className="text-red-500">*</span>}</Label>
      <div className="border-2 border-dashed rounded-lg p-4 text-center hover:border-primary/50 transition-colors">
        {uploadedFiles[documentType] ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-sm font-medium">Uploaded</span>
            </div>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => {
                setUploadedFiles(prev => {
                  const newState = { ...prev };
                  delete newState[documentType];
                  return newState;
                });
                const urlField = documentType === 'id_front' ? 'id_front_url' : 
                                 documentType === 'id_back' ? 'id_back_url' : 
                                 documentType === 'business_reg' ? 'business_reg_url' : null;
                if (urlField) {
                  setKycData(prev => ({ ...prev, [urlField]: '' }));
                }
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : uploading[documentType] ? (
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span className="text-sm">Uploading...</span>
          </div>
        ) : (
          <label className="cursor-pointer">
            <input
              type="file"
              className="hidden"
              accept="image/jpeg,image/png,image/jpg,application/pdf"
              onChange={(e) => handleFileUpload(e, documentType)}
            />
            <div className="flex flex-col items-center gap-2">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Click to upload</span>
              <span className="text-xs text-muted-foreground">JPG, PNG or PDF (max 5MB)</span>
            </div>
          </label>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4 py-4 max-h-[70vh] overflow-y-auto">
      {/* Upload Method Selection */}
      <div className="space-y-2">
        <Label>Choose submission method</Label>
        <Tabs value={uploadMethod} onValueChange={setUploadMethod}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Upload Documents
            </TabsTrigger>
            <TabsTrigger value="email" className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              Send via Email
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Basic Info - Always Required */}
      <div className="space-y-2">
        <Label>ID Type <span className="text-red-500">*</span></Label>
        <Select value={kycData.id_type} onValueChange={(v) => setKycData({ ...kycData, id_type: v })}>
          <SelectTrigger data-testid="kyc-id-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="national_id">National ID</SelectItem>
            <SelectItem value="passport">Passport</SelectItem>
            <SelectItem value="driving_license">Driving License</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <div className="space-y-2">
        <Label>ID Number <span className="text-red-500">*</span></Label>
        <Input
          placeholder="Enter ID number"
          value={kycData.id_number}
          onChange={(e) => setKycData({ ...kycData, id_number: e.target.value })}
          data-testid="kyc-id-number"
        />
      </div>

      {uploadMethod === "upload" ? (
        <>
          <Separator />
          <p className="text-sm font-medium">ID Document Photos</p>
          
          <FileUploadBox documentType="id_front" label="ID Front" required />
          <FileUploadBox documentType="id_back" label="ID Back" required />
          <FileUploadBox documentType="selfie" label="Selfie with ID (Optional)" />
          
          <Separator />
          <p className="text-sm text-muted-foreground">Business Information (Optional)</p>
          
          <div className="space-y-2">
            <Label>Business Name</Label>
            <Input
              placeholder="Your business name"
              value={kycData.business_name}
              onChange={(e) => setKycData({ ...kycData, business_name: e.target.value })}
              data-testid="kyc-business-name"
            />
          </div>
          
          <div className="space-y-2">
            <Label>Business Type</Label>
            <Input
              placeholder="e.g., Retail, Services"
              value={kycData.business_type}
              onChange={(e) => setKycData({ ...kycData, business_type: e.target.value })}
              data-testid="kyc-business-type"
            />
          </div>
          
          <FileUploadBox documentType="business_reg" label="Business Registration Document" />
          
          <DialogFooter>
            <Button onClick={onSubmit} data-testid="confirm-kyc-btn" disabled={!kycData.id_number}>
              Submit KYC
            </Button>
          </DialogFooter>
        </>
      ) : (
        <>
          <Separator />
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-blue-800">
                <Send className="h-5 w-5" />
                <span className="font-semibold">Email Submission Instructions</span>
              </div>
              <p className="text-sm text-blue-700">
                Send your KYC documents to the email address below:
              </p>
              <div className="flex items-center gap-2 bg-white rounded-lg p-3">
                <span className="font-mono text-sm flex-1">{kycEmail || "Loading..."}</span>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(kycEmail);
                    toast.success("Email copied to clipboard!");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <div className="text-sm text-blue-700 space-y-1">
                <p className="font-medium">Include in your email:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Your registered phone number in the subject line</li>
                  <li>Front photo of your ID</li>
                  <li>Back photo of your ID</li>
                  <li>Selfie holding your ID</li>
                  <li>Business documents (optional)</li>
                </ul>
              </div>
              <Button 
                className="w-full"
                onClick={() => window.open(`mailto:${kycEmail}?subject=KYC Documents - Phone: ${kycData.phone || 'YOUR_PHONE_NUMBER'}&body=Please find my KYC documents attached.%0A%0AID Type: ${kycData.id_type}%0AID Number: ${kycData.id_number}%0A%0ADocuments attached:%0A- ID Front%0A- ID Back%0A- Selfie with ID`, '_blank')}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Email App
              </Button>
            </CardContent>
          </Card>
          
          {emailConfirmed ? (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">Email Submission Confirmed</span>
                </div>
                <p className="text-sm text-green-600 mt-1">Our team is reviewing your documents. You'll be notified once verified.</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-amber-800">
                  <AlertCircle className="h-5 w-5" />
                  <span className="font-medium">Have you sent your documents?</span>
                </div>
                <p className="text-sm text-amber-700">
                  After sending your documents via email, click the button below to confirm and notify our team.
                </p>
                <Button 
                  className="w-full"
                  variant="default"
                  onClick={handleConfirmEmailSubmission}
                  disabled={confirmingEmail || !kycData.id_number}
                >
                  {confirmingEmail ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Confirming...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      I've Sent My Documents
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}
          
          <p className="text-xs text-muted-foreground text-center">
            After sending your documents via email, our team will review and update your KYC status within 24-48 hours.
          </p>
        </>
      )}
    </div>
  );
};

// ================== MPESA DEPOSIT PAGE ==================

const MPESADepositPage = () => {
  const { token, user } = useAuth();
  const [paybillInfo, setPaybillInfo] = useState(null);
  const [deposits, setDeposits] = useState([]);
  const [stkRequests, setStkRequests] = useState([]);
  const [systemSettings, setSystemSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [stkOpen, setStkOpen] = useState(false);
  const [formData, setFormData] = useState({
    amount: "",
    mpesa_ref: "",
    sender_phone: ""
  });
  const [stkData, setStkData] = useState({
    amount: "",
    phone_number: "",
    beneficiary_phone: "",
    pin: ""
  });
  const [processingStk, setProcessingStk] = useState(false);
  const [showStkPin, setShowStkPin] = useState(false);
  const [isThirdPartyDeposit, setIsThirdPartyDeposit] = useState(false);

  const fetchData = async (showError = true) => {
    try {
      const [paybill, depositsRes, settingsRes] = await Promise.all([
        apiCall("GET", "/mpesa/paybill", null, token),
        apiCall("GET", "/mpesa/deposits", null, token),
        apiCall("GET", "/system/settings", null, null)
      ]);
      setPaybillInfo(paybill);
      setDeposits(depositsRes);
      setSystemSettings(settingsRes);
      
      // Fetch STK requests if in STK mode
      if (settingsRes?.deposit_mode === "stk_push") {
        const stkRes = await apiCall("GET", "/mpesa/stk-requests", null, token);
        setStkRequests(stkRes);
      }
    } catch (err) {
      // Only show error on initial load, not on refresh after actions
      if (showError) {
        toast.error("Failed to load deposit data");
      }
      console.error("Failed to fetch deposit data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    
    // Poll for system settings changes every 30 seconds
    const settingsInterval = setInterval(async () => {
      try {
        const settingsRes = await apiCall("GET", "/system/settings", null, null);
        setSystemSettings(settingsRes);
        // If mode changed to STK push, also fetch STK requests
        if (settingsRes?.deposit_mode === "stk_push") {
          const stkRes = await apiCall("GET", "/mpesa/stk-requests", null, token);
          setStkRequests(stkRes);
        }
      } catch (err) {
        console.error("Failed to refresh settings:", err);
      }
    }, 30000);
    
    // Also refresh when page becomes visible again
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchData(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearInterval(settingsInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [token]);

  const handleSubmitDeposit = async () => {
    if (!formData.amount || !formData.mpesa_ref || !formData.sender_phone) {
      toast.error("All fields are required");
      return;
    }
    try {
      await apiCall("POST", "/mpesa/deposit", {
        amount: parseFloat(formData.amount),
        mpesa_ref: formData.mpesa_ref,
        sender_phone: formData.sender_phone
      }, token);
      toast.success("Deposit request submitted for approval");
      setSubmitOpen(false);
      setFormData({ amount: "", mpesa_ref: "", sender_phone: "" });
      // Refresh silently after success - don't show error toast
      fetchData(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to submit deposit");
    }
  };

  const handleInitiateSTKPush = async () => {
    if (!stkData.amount || !stkData.phone_number) {
      toast.error("Amount and phone number are required");
      return;
    }
    if (!stkData.pin || stkData.pin.length !== 4) {
      toast.error("4-digit PIN is required to authorize deposit");
      return;
    }
    setProcessingStk(true);
    try {
      const payload = {
        amount: parseFloat(stkData.amount),
        phone_number: stkData.phone_number,
        pin: stkData.pin
      };
      
      // Include beneficiary if third-party deposit
      if (isThirdPartyDeposit && stkData.beneficiary_phone) {
        payload.beneficiary_phone = stkData.beneficiary_phone;
      }
      
      const res = await apiCall("POST", "/mpesa/stk-push", payload, token);
      
      if (res.is_third_party) {
        toast.success(`STK Push initiated! Depositing to ${res.beneficiary}'s account.`);
      } else {
        toast.success("STK Push initiated! Check your phone to complete payment.");
      }
      setStkOpen(false);
      setStkData({ amount: "", phone_number: "", beneficiary_phone: "", pin: "" });
      setIsThirdPartyDeposit(false);
      // Refresh silently after success
      fetchData(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to initiate STK push");
    } finally {
      setProcessingStk(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard!");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const depositMode = systemSettings?.deposit_mode || "manual";

  const getStatusBadge = (status) => {
    switch (status) {
      case "approved": 
      case "completed": 
        return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case "pending": 
      case "processing": 
        return <Badge className="bg-amber-100 text-amber-800">Pending</Badge>;
      case "rejected": 
      case "failed": 
        return <Badge className="bg-red-100 text-red-800">Failed</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6" data-testid="mpesa-deposit-page">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-3xl font-bold">MPESA Deposit</h2>
        <div className="flex items-center gap-3">
          <Badge className={depositMode === "stk_push" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}>
            {depositMode === "stk_push" ? "STK Push Mode" : "Manual Mode"}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => fetchData(false)} data-testid="refresh-deposit-btn">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Deposit UI - Show appropriate option based on system config */}
      {depositMode === "stk_push" ? (
        <>
          {/* STK Push Deposit */}
          <Card className="border-green-200 bg-green-50" data-testid="stk-push-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-green-600" />
                Deposit via MPESA
              </CardTitle>
              <CardDescription>Anyone can pay to deposit into your wallet - no registration required for the payer</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-white p-4 rounded-lg border">
                <p className="text-sm text-muted-foreground mb-2">
                  <strong>How it works:</strong> Enter any phone number to receive the M-Pesa prompt. The payer doesn't need to have an account - the money goes directly to your wallet.
                </p>
              </div>
              
              <Dialog open={stkOpen} onOpenChange={setStkOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full bg-green-600 hover:bg-green-700" data-testid="initiate-stk-btn">
                    <Smartphone className="h-4 w-4 mr-2" />
                    Initiate Deposit
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>MPESA STK Push Deposit</DialogTitle>
                    <DialogDescription>Anyone can pay to deposit into your wallet</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Amount (KES)</Label>
                      <Input
                        type="number"
                        placeholder="e.g., 5000"
                        value={stkData.amount}
                        onChange={(e) => setStkData({ ...stkData, amount: e.target.value })}
                        data-testid="stk-amount-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Paying Phone Number</Label>
                      <Input
                        type="tel"
                        placeholder="0712345678"
                        value={stkData.phone_number}
                        onChange={(e) => setStkData({ ...stkData, phone_number: e.target.value })}
                        data-testid="stk-phone-input"
                      />
                      <p className="text-xs text-muted-foreground">
                        This number will receive the M-Pesa prompt. <strong>Does not need to be registered</strong> - anyone can pay to credit your account.
                      </p>
                    </div>
                    
                    {/* Third-Party Deposit Toggle */}
                    <div className="border rounded-lg p-3 bg-blue-50 border-blue-200">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-blue-600" />
                          <Label className="text-sm font-medium">Deposit to a different account?</Label>
                        </div>
                        <input
                          type="checkbox"
                          checked={isThirdPartyDeposit}
                          onChange={(e) => setIsThirdPartyDeposit(e.target.checked)}
                          className="h-4 w-4 accent-blue-600"
                          data-testid="third-party-toggle"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        By default, funds go to your wallet. Toggle this to credit someone else's account.
                      </p>
                      {isThirdPartyDeposit && (
                        <div className="mt-3 space-y-2">
                          <Label>Beneficiary Phone Number</Label>
                          <Input
                            type="tel"
                            placeholder="0798765432"
                            value={stkData.beneficiary_phone}
                            onChange={(e) => setStkData({ ...stkData, beneficiary_phone: e.target.value })}
                            data-testid="beneficiary-phone-input"
                          />
                          <p className="text-xs text-blue-600">This registered account will be credited after payment</p>
                        </div>
                      )}
                    </div>
                    
                    {/* PIN Verification Section */}
                    <div className="border-t pt-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Lock className="h-4 w-4 text-green-600" />
                        <Label className="font-semibold text-green-700">PIN Verification Required</Label>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        Enter your 4-digit PIN to authorize this deposit
                      </p>
                      <div className="relative">
                        <Input
                          type={showStkPin ? "text" : "password"}
                          placeholder="Enter 4-digit PIN"
                          maxLength={4}
                          value={stkData.pin}
                          onChange={(e) => setStkData({ ...stkData, pin: e.target.value.replace(/\D/g, "") })}
                          className="text-center tracking-widest text-lg font-bold"
                          data-testid="stk-pin-input"
                        />
                        <button
                          type="button"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          onClick={() => setShowStkPin(!showStkPin)}
                        >
                          {showStkPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setStkOpen(false)}>Cancel</Button>
                    <Button 
                      onClick={handleInitiateSTKPush} 
                      disabled={processingStk || stkData.pin.length !== 4} 
                      className="bg-green-600 hover:bg-green-700"
                      data-testid="confirm-stk-btn"
                    >
                      {processingStk ? "Processing..." : "Authorize & Send Prompt"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <div className="bg-amber-50 p-3 rounded border border-amber-200">
                <p className="text-sm text-amber-800 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  <span><strong>Note:</strong> Your deposit will be processed shortly after confirmation.</span>
                </p>
              </div>
            </CardContent>
          </Card>

          {/* STK Request History */}
          <Card data-testid="stk-history">
            <CardHeader>
              <CardTitle className="text-lg">STK Push History</CardTitle>
            </CardHeader>
            <CardContent>
              {stkRequests.length > 0 ? (
                <ScrollArea className="h-[300px]">
                  <div className="space-y-3">
                    {stkRequests.map((request, i) => (
                      <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <p className="font-semibold tabular-nums">KES {request.amount?.toLocaleString()}</p>
                          <p className="text-sm text-muted-foreground">To: {request.phone_number}</p>
                          {request.mpesa_receipt && (
                            <p className="text-sm text-green-600">Receipt: {request.mpesa_receipt}</p>
                          )}
                          <p className="text-xs text-muted-foreground">{new Date(request.created_at).toLocaleString()}</p>
                        </div>
                        {getStatusBadge(request.status)}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <p className="text-center text-muted-foreground py-8">No STK push requests yet</p>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          {/* Paybill Deposit */}
          {/* Paybill Instructions */}
          <Card className="border-primary/30 bg-primary/5" data-testid="paybill-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Smartphone className="h-5 w-5 text-primary" />
                How to Deposit via MPESA
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="p-4 bg-card rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Paybill Number</p>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-2xl tabular-nums">{paybillInfo?.paybill_number}</p>
                    <Button variant="ghost" size="icon" onClick={() => copyToClipboard(paybillInfo?.paybill_number)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="p-4 bg-card rounded-lg">
                  <p className="text-sm text-muted-foreground mb-1">Account Number</p>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-lg">{paybillInfo?.account_number}</p>
                    <Button variant="ghost" size="icon" onClick={() => copyToClipboard(paybillInfo?.account_number)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
                <p className="text-sm text-amber-800">
                  <strong>Steps:</strong> Go to M-PESA → Lipa na M-PESA → Pay Bill → Enter Business No: <strong>{paybillInfo?.paybill_number}</strong> → 
                  Account No: <strong>{paybillInfo?.account_number}</strong> → Enter Amount → Enter PIN
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Submit Deposit */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Submit Deposit Confirmation</CardTitle>
              <CardDescription>After sending MPESA, submit the details for verification</CardDescription>
            </CardHeader>
            <CardContent>
              <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full" data-testid="submit-deposit-btn">
                    <Plus className="h-4 w-4 mr-2" />
                    Submit Deposit Details
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Submit MPESA Deposit</DialogTitle>
                    <DialogDescription>Enter the details from your MPESA confirmation message</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Amount (KES)</Label>
                      <Input
                        type="number"
                        placeholder="e.g., 5000"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        data-testid="deposit-amount-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>MPESA Reference Code</Label>
                      <Input
                        placeholder="e.g., RKJ4XYZ123"
                        value={formData.mpesa_ref}
                        onChange={(e) => setFormData({ ...formData, mpesa_ref: e.target.value.toUpperCase() })}
                        data-testid="deposit-ref-input"
                      />
                      <p className="text-xs text-muted-foreground">Find this in your MPESA confirmation SMS</p>
                    </div>
                    <div className="space-y-2">
                      <Label>Sender Phone Number</Label>
                      <Input
                        type="tel"
                        placeholder="e.g., 0712345678"
                        value={formData.sender_phone}
                        onChange={(e) => setFormData({ ...formData, sender_phone: e.target.value })}
                        data-testid="deposit-phone-input"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setSubmitOpen(false)}>Cancel</Button>
                    <Button onClick={handleSubmitDeposit} data-testid="confirm-deposit-btn">Submit</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>

          {/* Deposit History */}
          <Card data-testid="deposit-history">
            <CardHeader>
              <CardTitle className="text-lg">Deposit History</CardTitle>
            </CardHeader>
            <CardContent>
              {deposits.length > 0 ? (
                <ScrollArea className="h-[300px]">
                  <div className="space-y-3">
                    {deposits.map((deposit, i) => (
                      <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <p className="font-semibold tabular-nums">KES {deposit.amount?.toLocaleString()}</p>
                          <p className="text-sm text-muted-foreground">Ref: {deposit.mpesa_ref}</p>
                          <p className="text-xs text-muted-foreground">{new Date(deposit.created_at).toLocaleString()}</p>
                        </div>
                        {getStatusBadge(deposit.status)}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <p className="text-center text-muted-foreground py-8">No deposits yet</p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

// ================== WITHDRAWAL PAGE ==================

const WithdrawalPage = () => {
  const { token, user } = useAuth();
  const [withdrawals, setWithdrawals] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [systemSettings, setSystemSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawType, setWithdrawType] = useState("mpesa");
  const [formData, setFormData] = useState({
    amount: "",
    destination_phone: "",
    bank_name: "",
    bank_account: "",
    bank_account_name: "",
    pin: ""
  });
  const [showPin, setShowPin] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchData = async (showError = true) => {
    try {
      const [walletRes, withdrawalsRes, settingsRes] = await Promise.all([
        apiCall("GET", "/wallet", null, token),
        apiCall("GET", "/withdrawals", null, token),
        apiCall("GET", "/system/settings", null, null)
      ]);
      setWallet(walletRes);
      setWithdrawals(withdrawalsRes);
      setSystemSettings(settingsRes);
    } catch (err) {
      if (showError) {
        toast.error("Failed to load withdrawal data");
      }
      console.error("Failed to load withdrawal data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    
    // Poll for system settings changes every 30 seconds
    const settingsInterval = setInterval(async () => {
      try {
        const settingsRes = await apiCall("GET", "/system/settings", null, null);
        setSystemSettings(settingsRes);
      } catch (err) {
        console.error("Failed to refresh settings:", err);
      }
    }, 30000);
    
    // Also refresh when page becomes visible again
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        fetchData(false);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      clearInterval(settingsInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [token]);

  const handleRequestWithdrawal = async () => {
    if (!formData.amount) {
      toast.error("Amount is required");
      return;
    }
    if (withdrawType === "mpesa" && !formData.destination_phone) {
      toast.error("MPESA phone number is required");
      return;
    }
    if (withdrawType === "bank" && (!formData.bank_name || !formData.bank_account)) {
      toast.error("Bank details are required");
      return;
    }
    if (!formData.pin || formData.pin.length !== 4) {
      toast.error("4-digit PIN is required to authorize withdrawal");
      return;
    }

    setSubmitting(true);
    try {
      await apiCall("POST", "/withdrawals/request", {
        amount: parseFloat(formData.amount),
        withdrawal_type: withdrawType,
        destination_phone: withdrawType === "mpesa" ? formData.destination_phone : null,
        bank_name: withdrawType === "bank" ? formData.bank_name : null,
        bank_account: withdrawType === "bank" ? formData.bank_account : null,
        bank_account_name: withdrawType === "bank" ? formData.bank_account_name : null,
        pin: formData.pin
      }, token);
      toast.success("Withdrawal request submitted");
      setWithdrawOpen(false);
      setFormData({ amount: "", destination_phone: "", bank_name: "", bank_account: "", bank_account_name: "", pin: "" });
      fetchData(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to request withdrawal");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const withdrawalMode = systemSettings?.withdrawal_mode || "manual";

  const getStatusBadge = (status, autoProcessed) => {
    switch (status) {
      case "paid": return <Badge className="bg-green-100 text-green-800">Completed</Badge>;
      case "approved": return <Badge className="bg-blue-100 text-blue-800">Processing</Badge>;
      case "pending": return <Badge className="bg-amber-100 text-amber-800">Pending</Badge>;
      case "rejected": return <Badge className="bg-red-100 text-red-800">Rejected</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getStatusMessage = (status) => {
    switch (status) {
      case "pending": return "Your request is being processed";
      case "approved": return "Payment is being sent";
      case "paid": return "Payment completed";
      default: return "";
    }
  };

  return (
    <div className="space-y-6" data-testid="withdrawal-page">
      <h2 className="font-heading text-3xl font-bold">Withdraw Funds</h2>

      {/* Balance Card */}
      <Card className="bg-gradient-to-br from-primary to-emerald-700 text-white">
        <CardContent className="p-6">
          <p className="text-emerald-100 mb-1">Available Balance</p>
          <h3 className="font-heading text-4xl font-black tabular-nums">
            KES {(wallet?.balance || 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
          </h3>
        </CardContent>
      </Card>

      {/* Request Withdrawal */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Request Withdrawal</CardTitle>
          <CardDescription>Withdraw to MPESA or Bank Account</CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
            <DialogTrigger asChild>
              <Button className="w-full" data-testid="request-withdrawal-btn">
                <Send className="h-4 w-4 mr-2" />
                Request Withdrawal
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Request Withdrawal</DialogTitle>
                <DialogDescription>Choose withdrawal method and enter details</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <Tabs value={withdrawType} onValueChange={setWithdrawType}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="mpesa" data-testid="mpesa-tab">
                      <Smartphone className="h-4 w-4 mr-2" />
                      MPESA
                    </TabsTrigger>
                    <TabsTrigger value="bank" data-testid="bank-tab">
                      <Building2 className="h-4 w-4 mr-2" />
                      Bank
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="mpesa" className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label>Amount (KES)</Label>
                      <Input
                        type="number"
                        placeholder="e.g., 5000"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        data-testid="withdraw-amount-mpesa"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>MPESA Phone Number</Label>
                      <Input
                        type="tel"
                        placeholder="e.g., 0712345678"
                        value={formData.destination_phone}
                        onChange={(e) => setFormData({ ...formData, destination_phone: e.target.value })}
                        data-testid="withdraw-phone"
                      />
                    </div>
                  </TabsContent>
                  <TabsContent value="bank" className="space-y-4 mt-4">
                    <div className="space-y-2">
                      <Label>Amount (KES)</Label>
                      <Input
                        type="number"
                        placeholder="e.g., 10000"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        data-testid="withdraw-amount-bank"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Bank Name</Label>
                      <Select value={formData.bank_name} onValueChange={(v) => setFormData({ ...formData, bank_name: v })}>
                        <SelectTrigger data-testid="bank-name-select">
                          <SelectValue placeholder="Select bank" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Equity Bank">Equity Bank</SelectItem>
                          <SelectItem value="KCB Bank">KCB Bank</SelectItem>
                          <SelectItem value="Co-operative Bank">Co-operative Bank</SelectItem>
                          <SelectItem value="NCBA Bank">NCBA Bank</SelectItem>
                          <SelectItem value="Absa Bank">Absa Bank</SelectItem>
                          <SelectItem value="Stanbic Bank">Stanbic Bank</SelectItem>
                          <SelectItem value="Standard Chartered">Standard Chartered</SelectItem>
                          <SelectItem value="DTB Bank">DTB Bank</SelectItem>
                          <SelectItem value="I&M Bank">I&M Bank</SelectItem>
                          <SelectItem value="Family Bank">Family Bank</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Account Number</Label>
                      <Input
                        placeholder="Bank account number"
                        value={formData.bank_account}
                        onChange={(e) => setFormData({ ...formData, bank_account: e.target.value })}
                        data-testid="bank-account"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Account Name</Label>
                      <Input
                        placeholder="Name on account"
                        value={formData.bank_account_name}
                        onChange={(e) => setFormData({ ...formData, bank_account_name: e.target.value })}
                        data-testid="bank-account-name"
                      />
                    </div>
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      Bank withdrawals require KYC approval
                    </p>
                  </TabsContent>
                </Tabs>
                
                {/* PIN Verification Section */}
                <div className="border-t pt-4 mt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Lock className="h-4 w-4 text-primary" />
                    <Label className="font-semibold text-primary">PIN Verification Required</Label>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Enter your 4-digit PIN to authorize this withdrawal
                  </p>
                  <div className="relative">
                    <Input
                      type={showPin ? "text" : "password"}
                      placeholder="Enter 4-digit PIN"
                      maxLength={4}
                      value={formData.pin}
                      onChange={(e) => setFormData({ ...formData, pin: e.target.value.replace(/\D/g, "") })}
                      className="text-center tracking-widest text-lg font-bold"
                      data-testid="withdraw-pin-input"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPin(!showPin)}
                    >
                      {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setWithdrawOpen(false)}>Cancel</Button>
                <Button 
                  onClick={handleRequestWithdrawal} 
                  disabled={submitting || formData.pin.length !== 4}
                  data-testid="confirm-withdrawal-btn"
                >
                  {submitting ? "Processing..." : "Authorize & Submit"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {/* Withdrawal History */}
      <Card data-testid="withdrawal-history">
        <CardHeader>
          <CardTitle className="text-lg">Withdrawal History</CardTitle>
        </CardHeader>
        <CardContent>
          {withdrawals.length > 0 ? (
            <ScrollArea className="h-[300px]">
              <div className="space-y-3">
                {withdrawals.map((withdrawal, i) => (
                  <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-semibold tabular-nums">KES {withdrawal.amount?.toLocaleString()}</p>
                      {withdrawal.fee_amount > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Fee: KES {withdrawal.fee_amount?.toLocaleString()} | Net: KES {withdrawal.net_amount?.toLocaleString()}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {withdrawal.withdrawal_type === "mpesa" 
                          ? `MPESA: ${withdrawal.destination_phone}` 
                          : `${withdrawal.bank_name}: ${withdrawal.bank_account}`}
                      </p>
                      <p className="text-xs text-muted-foreground">{new Date(withdrawal.created_at).toLocaleString()}</p>
                      {withdrawal.mpesa_transaction_id && (
                        <p className="text-xs text-green-600 font-medium">M-Pesa Ref: {withdrawal.mpesa_transaction_id}</p>
                      )}
                      {withdrawal.auto_transaction_id && !withdrawal.mpesa_transaction_id && (
                        <p className="text-xs text-green-600">Ref: {withdrawal.auto_transaction_id}</p>
                      )}
                      {withdrawal.pin_verified && (
                        <Badge variant="outline" className="text-xs mt-1 bg-green-50 text-green-700 border-green-200">
                          <Shield className="h-3 w-3 mr-1" />
                          PIN Verified
                        </Badge>
                      )}
                      <p className="text-xs text-muted-foreground italic mt-1">{getStatusMessage(withdrawal.status)}</p>
                    </div>
                    {getStatusBadge(withdrawal.status, withdrawal.auto_processed)}
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <p className="text-center text-muted-foreground py-8">No withdrawals yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// ================== STATEMENTS PAGE ==================

// ================== AIRTIME PAGE ==================

const AirtimePage = () => {
  const { token } = useAuth();
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  
  // Form state
  const [phoneNumber, setPhoneNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [network, setNetwork] = useState("");
  const [detectedNetwork, setDetectedNetwork] = useState(null);
  
  // Quick amounts
  const quickAmounts = [10, 20, 50, 100, 200, 500, 1000];
  
  const fetchWallet = async () => {
    try {
      const res = await apiCall("GET", "/wallet", null, token);
      setWallet(res);
    } catch (err) {
      toast.error("Failed to load wallet");
    } finally {
      setLoading(false);
    }
  };
  
  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await apiCall("GET", "/airtime/history?limit=20", null, token);
      setHistory(res.purchases || []);
    } catch (err) {
      console.error("Failed to load airtime history", err);
    } finally {
      setHistoryLoading(false);
    }
  };
  
  useEffect(() => {
    fetchWallet();
    fetchHistory();
  }, [token]);
  
  // Detect network when phone number changes
  useEffect(() => {
    const detectNetwork = async () => {
      if (phoneNumber.length >= 9) {
        try {
          const res = await apiCall("GET", `/airtime/detect-network?phone=${phoneNumber}`, null, token);
          setDetectedNetwork(res);
          if (res.network && res.network !== "unknown") {
            setNetwork(res.network);
          }
        } catch (err) {
          setDetectedNetwork(null);
        }
      } else {
        setDetectedNetwork(null);
        setNetwork("");
      }
    };
    detectNetwork();
  }, [phoneNumber, token]);
  
  const handlePurchase = async () => {
    if (!phoneNumber || !amount) {
      toast.error("Please enter phone number and amount");
      return;
    }
    
    const amountNum = parseInt(amount);
    if (amountNum < 10) {
      toast.error("Minimum amount is KES 10");
      return;
    }
    
    if (wallet?.available_balance < amountNum) {
      toast.error("Insufficient wallet balance");
      return;
    }
    
    setPurchasing(true);
    try {
      const res = await apiCall("POST", "/airtime/purchase", {
        phone_number: phoneNumber,
        amount: amountNum,
        network: network || undefined
      }, token);
      
      toast.success(res.message || "Airtime purchased successfully!");
      
      // Reset form
      setPhoneNumber("");
      setAmount("");
      setNetwork("");
      setDetectedNetwork(null);
      
      // Refresh data
      fetchWallet();
      fetchHistory();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to purchase airtime");
    } finally {
      setPurchasing(false);
    }
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  return (
    <div className="space-y-6" data-testid="airtime-page">
      <h2 className="font-heading text-3xl font-bold">Buy Airtime</h2>
      
      {/* Wallet Balance Card */}
      <Card className="bg-gradient-to-br from-primary to-emerald-700 text-white">
        <CardContent className="p-6">
          <p className="text-emerald-100">Available Balance</p>
          <h3 className="font-heading text-3xl font-black tabular-nums" data-testid="airtime-wallet-balance">
            KES {(wallet?.available_balance ?? wallet?.balance ?? 0).toLocaleString("en-KE", { minimumFractionDigits: 2 })}
          </h3>
        </CardContent>
      </Card>
      
      {/* Purchase Form */}
      <Card data-testid="airtime-purchase-form">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Purchase Airtime
          </CardTitle>
          <CardDescription>Buy airtime for Safaricom or Airtel</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Phone Number */}
          <div className="space-y-2">
            <Label>Phone Number</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
              <Input
                type="tel"
                placeholder="0712345678"
                className="pl-10 h-12"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                data-testid="airtime-phone-input"
              />
            </div>
            {detectedNetwork && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Network:</span>
                {detectedNetwork.supported ? (
                  <Badge className={detectedNetwork.network === "safaricom" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                    {detectedNetwork.network === "safaricom" ? "Safaricom" : "Airtel"}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-amber-600 border-amber-400">
                    Unknown Network
                  </Badge>
                )}
              </div>
            )}
          </div>
          
          {/* Network Selection (if not auto-detected) */}
          {detectedNetwork && !detectedNetwork.supported && (
            <div className="space-y-2">
              <Label>Select Network</Label>
              <Select value={network} onValueChange={setNetwork}>
                <SelectTrigger data-testid="airtime-network-select">
                  <SelectValue placeholder="Choose network" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="safaricom">Safaricom</SelectItem>
                  <SelectItem value="airtel">Airtel</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          
          {/* Amount Input */}
          <div className="space-y-2">
            <Label>Amount (KES)</Label>
            <Input
              type="number"
              placeholder="Minimum KES 10"
              className="h-12 text-lg"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={10}
              max={10000}
              data-testid="airtime-amount-input"
            />
          </div>
          
          {/* Quick Amounts */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Quick Select</Label>
            <div className="flex flex-wrap gap-2">
              {quickAmounts.map((amt) => (
                <Button
                  key={amt}
                  variant={amount === String(amt) ? "default" : "outline"}
                  size="sm"
                  onClick={() => setAmount(String(amt))}
                  data-testid={`quick-amount-${amt}`}
                >
                  {amt}
                </Button>
              ))}
            </div>
          </div>
          
          {/* Purchase Button */}
          <Button
            className="w-full h-12 text-lg font-semibold"
            onClick={handlePurchase}
            disabled={purchasing || !phoneNumber || !amount || parseInt(amount) < 10}
            data-testid="purchase-airtime-btn"
          >
            {purchasing ? (
              <>
                <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Zap className="h-5 w-5 mr-2" />
                Buy KES {amount || "0"} Airtime
              </>
            )}
          </Button>
        </CardContent>
      </Card>
      
      {/* Purchase History */}
      <Card data-testid="airtime-history">
        <CardHeader>
          <CardTitle>Recent Purchases</CardTitle>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : history.length > 0 ? (
            <ScrollArea className="h-[300px]">
              <div className="space-y-3">
                {history.map((purchase, i) => (
                  <div key={i} className="flex items-center justify-between py-3 border-b last:border-0">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${purchase.network === "safaricom" ? "bg-green-100" : "bg-red-100"}`}>
                        <Phone className={`h-4 w-4 ${purchase.network === "safaricom" ? "text-green-600" : "text-red-600"}`} />
                      </div>
                      <div>
                        <p className="font-medium">{purchase.phone_number}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Badge variant="outline" className="text-xs">
                            {purchase.network === "safaricom" ? "Safaricom" : "Airtel"}
                          </Badge>
                          <span>{new Date(purchase.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold tabular-nums">KES {purchase.amount?.toLocaleString()}</p>
                      <Badge 
                        variant={purchase.status === "completed" ? "default" : purchase.status === "pending" ? "secondary" : "destructive"}
                        className="text-xs"
                      >
                        {purchase.status}
                      </Badge>
                      {purchase.simulated && (
                        <Badge variant="outline" className="ml-1 text-xs text-amber-600">
                          Simulated
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <p className="text-center text-muted-foreground py-8">No airtime purchases yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const StatementsPage = () => {
  const { token, user } = useAuth();
  const [statements, setStatements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [requestOpen, setRequestOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState("sms");
  const [email, setEmail] = useState("");

  const fetchStatements = async () => {
    try {
      const res = await apiCall("GET", "/statements", null, token);
      setStatements(res);
    } catch (err) {
      toast.error("Failed to load statements");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatements();
  }, [token]);

  const handleRequestStatement = async () => {
    if (!startDate || !endDate) {
      toast.error("Please select date range");
      return;
    }
    if (deliveryMethod === "email" && !email) {
      toast.error("Please enter email address");
      return;
    }
    try {
      await apiCall("POST", "/statements/request", {
        start_date: startDate,
        end_date: endDate,
        delivery_method: deliveryMethod,
        email: deliveryMethod === "email" ? email : null
      }, token);
      toast.success("Statement request submitted");
      setRequestOpen(false);
      setStartDate("");
      setEndDate("");
      setDeliveryMethod("sms");
      setEmail("");
      fetchStatements();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to request statement");
    }
  };

  const handleDownload = async (statementId) => {
    try {
      const response = await fetch(`${API}/statements/${statementId}/download`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Download failed');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `statement_${statementId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("Statement downloaded successfully");
    } catch (err) {
      toast.error(err.message || "Failed to download statement");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case "generated": return <Badge className="bg-green-100 text-green-800">Ready</Badge>;
      case "pending": return <Badge className="bg-amber-100 text-amber-800">Pending</Badge>;
      case "rejected": return <Badge className="bg-red-100 text-red-800">Rejected</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getDeliveryBadge = (method) => {
    return method === "email" 
      ? <Badge variant="outline" className="text-blue-600 border-blue-300">Email</Badge>
      : <Badge variant="outline" className="text-green-600 border-green-300">SMS</Badge>;
  };

  return (
    <div className="space-y-6" data-testid="statements-page">
      <h2 className="font-heading text-3xl font-bold">Account Statements</h2>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Request Statement</CardTitle>
          <CardDescription>Request an official account statement for a date range</CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
            <DialogTrigger asChild>
              <Button className="w-full" data-testid="request-statement-btn">
                <FileText className="h-4 w-4 mr-2" />
                Request New Statement
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Request Account Statement</DialogTitle>
                <DialogDescription>Select the date range and delivery method</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      data-testid="statement-start-date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      data-testid="statement-end-date"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>Delivery Method</Label>
                  <div className="flex gap-4">
                    <div 
                      className={`flex-1 p-4 border rounded-lg cursor-pointer transition-colors ${deliveryMethod === "sms" ? "border-primary bg-primary/5" : "hover:bg-slate-50"}`}
                      onClick={() => setDeliveryMethod("sms")}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded-full border-2 ${deliveryMethod === "sms" ? "border-primary bg-primary" : "border-slate-300"}`} />
                        <Smartphone className="h-4 w-4" />
                        <span className="font-medium">SMS</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 ml-6">Send to {user?.phone}</p>
                    </div>
                    <div 
                      className={`flex-1 p-4 border rounded-lg cursor-pointer transition-colors ${deliveryMethod === "email" ? "border-primary bg-primary/5" : "hover:bg-slate-50"}`}
                      onClick={() => setDeliveryMethod("email")}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded-full border-2 ${deliveryMethod === "email" ? "border-primary bg-primary" : "border-slate-300"}`} />
                        <Send className="h-4 w-4" />
                        <span className="font-medium">Email</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 ml-6">Enter email address</p>
                    </div>
                  </div>
                </div>

                {deliveryMethod === "email" && (
                  <div className="space-y-2">
                    <Label>Email Address</Label>
                    <Input
                      type="email"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      data-testid="statement-email"
                    />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRequestOpen(false)}>Cancel</Button>
                <Button onClick={handleRequestStatement} data-testid="confirm-statement-btn">Submit Request</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {/* Statement History */}
      <Card data-testid="statement-history">
        <CardHeader>
          <CardTitle className="text-lg">Statement Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {statements.length > 0 ? (
            <div className="space-y-3">
              {statements.map((statement, i) => (
                <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-semibold">{statement.start_date} to {statement.end_date}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {getDeliveryBadge(statement.delivery_method)}
                      <span className="text-xs text-muted-foreground">
                        {statement.delivery_method === "email" ? statement.delivery_email : statement.delivery_phone}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Requested: {new Date(statement.created_at).toLocaleString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(statement.status)}
                    {statement.status === "generated" && (
                      <Button size="sm" variant="outline" onClick={() => handleDownload(statement.id)} data-testid={`download-statement-${i}`}>
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">No statement requests yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// ================== ADMIN PAGES ==================

const AdminLoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { adminLogin } = useAuth();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiCall("POST", "/admin/login", { email, password });
      adminLogin(res.token, res.admin);
      toast.success("Welcome, Admin!");
      navigate("/admin/dashboard");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFirstAdmin = async () => {
    if (!email || !password) {
      toast.error("Enter email and password first");
      return;
    }
    setLoading(true);
    try {
      await apiCall("POST", "/admin/create", { email, password, name: "Admin" });
      toast.success("Admin account created! Please login.");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create admin");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-md" data-testid="admin-login-card">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <CardTitle className="font-heading text-2xl">Admin Portal</CardTitle>
          <CardDescription>Dolaglobo Finance Management</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="admin@dolaglobo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="admin-email-input"
              />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="admin-password-input"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading} data-testid="admin-login-btn">
              {loading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <Button variant="link" onClick={handleCreateFirstAdmin} data-testid="create-first-admin">
              Create First Admin Account
            </Button>
          </div>
          <div className="mt-4 text-center">
            <Button variant="ghost" onClick={() => navigate("/login")} data-testid="back-to-user-login">
              Back to User Login
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const AdminLayout = ({ children }) => {
  const { admin, adminLogout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { path: "/admin/dashboard", icon: BarChart3, label: "Dashboard" },
    { path: "/admin/deposits", icon: Receipt, label: "Deposits" },
    { path: "/admin/withdrawals", icon: Send, label: "Withdrawals" },
    { path: "/admin/airtime", icon: Zap, label: "Airtime" },
    { path: "/admin/kyc", icon: Shield, label: "KYC" },
    { path: "/admin/loans", icon: CreditCard, label: "Loans" },
    { path: "/admin/statements", icon: FileText, label: "Statements" },
    { path: "/admin/wallets", icon: Wallet, label: "Wallets" },
    { path: "/admin/rates", icon: Percent, label: "Rates" },
    { path: "/admin/paybill", icon: Smartphone, label: "Paybill" },
    { path: "/admin/users", icon: Users, label: "Users" },
    { path: "/admin/vacancies", icon: Briefcase, label: "Vacancies" },
    { path: "/admin/contacts", icon: Phone, label: "Contacts" },
    { path: "/admin/app-versions", icon: Download, label: "App Downloads" },
    { path: "/admin/fee-rules", icon: Percent, label: "Fee Rules" },
    { path: "/admin/content", icon: ClipboardList, label: "Content" },
    { path: "/admin/settings", icon: Settings, label: "Settings" },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-50 bg-slate-900 text-white">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <h1 className="font-heading font-bold text-xl">Dolaglobo Admin</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <span className="text-sm text-slate-300">{admin?.email}</span>
              {admin?.role === "super_admin" && (
                <Badge className="ml-2 bg-amber-500 text-white text-xs">SUPER ADMIN</Badge>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={adminLogout} className="text-white hover:text-white hover:bg-slate-800" data-testid="admin-logout">
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
        <nav className="flex gap-1 px-4 pb-2 overflow-x-auto">
          {navItems.map((item) => (
            <Button
              key={item.path}
              variant="ghost"
              size="sm"
              className={`text-slate-300 hover:text-white hover:bg-slate-800 ${location.pathname === item.path ? "bg-slate-800 text-white" : ""}`}
              onClick={() => navigate(item.path)}
              data-testid={`admin-nav-${item.label.toLowerCase().replace(" ", "-")}`}
            >
              <item.icon className="h-4 w-4 mr-2" />
              {item.label}
            </Button>
          ))}
        </nav>
      </header>
      <main className="p-4 md:p-8">
        {children}
      </main>
    </div>
  );
};

const AdminDashboardPage = () => {
  const { adminToken } = useAuth();
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyticsPeriod, setAnalyticsPeriod] = useState("daily");

  const fetchData = async (showError = true) => {
    try {
      const [statsRes, analyticsRes] = await Promise.all([
        apiCall("GET", "/admin/dashboard", null, adminToken),
        apiCall("GET", `/admin/analytics?period=${analyticsPeriod}`, null, adminToken)
      ]);
      setStats(statsRes);
      setAnalytics(analyticsRes);
    } catch (err) {
      if (showError) {
        toast.error("Failed to load admin dashboard");
      }
      console.error("Failed to load admin dashboard:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [adminToken, analyticsPeriod]);

  const handlePeriodChange = (newPeriod) => {
    setAnalyticsPeriod(newPeriod);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const statCards = [
    { label: "Total Users", value: stats?.users?.total || 0, icon: Users, color: "bg-blue-500" },
    { label: "KYC Pending", value: stats?.users?.kyc_pending || 0, icon: Shield, color: "bg-amber-500" },
    { label: "KYC Email", value: stats?.users?.kyc_email_pending || 0, icon: Send, color: "bg-cyan-500", highlight: true },
    { label: "Deposits Pending", value: stats?.pending_actions?.deposits || 0, icon: Receipt, color: "bg-green-500" },
    { label: "STK Requests", value: stats?.pending_actions?.stk_requests || 0, icon: Smartphone, color: "bg-teal-500" },
    { label: "Withdrawals Pending", value: stats?.pending_actions?.withdrawals || 0, icon: ArrowUpRight, color: "bg-orange-500" },
    { label: "Pending Loans", value: stats?.loans?.pending || 0, icon: CreditCard, color: "bg-purple-500" },
    { label: "Statements Pending", value: stats?.pending_actions?.statements || 0, icon: FileText, color: "bg-pink-500" },
  ];

  const systemSettings = stats?.system_settings;
  const unreadNotifications = stats?.unread_notifications || 0;

  const formatCurrency = (amount) => {
    return `KES ${(amount || 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getChangeIndicator = (change) => {
    if (change > 0) {
      return <span className="text-green-600 text-sm flex items-center gap-1"><TrendingUp className="h-3 w-3" />+{change}%</span>;
    } else if (change < 0) {
      return <span className="text-red-600 text-sm flex items-center gap-1"><ArrowDownLeft className="h-3 w-3" />{change}%</span>;
    }
    return <span className="text-muted-foreground text-sm">0%</span>;
  };

  return (
    <div className="space-y-6" data-testid="admin-dashboard">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-3xl font-bold">Dashboard</h2>
        <div className="flex items-center gap-3">
          {unreadNotifications > 0 && (
            <Button 
              variant="outline" 
              size="sm" 
              className="relative"
              onClick={() => window.location.href = "/admin/kyc"}
            >
              <Bell className="h-4 w-4" />
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                {unreadNotifications}
              </span>
              <span className="ml-2">Notifications</span>
            </Button>
          )}
          {stats?.admin_role === "super_admin" && (
            <Badge className="bg-amber-100 text-amber-800">Super Admin</Badge>
          )}
        </div>
      </div>

      {/* Email KYC Alert */}
      {(stats?.users?.kyc_email_pending || 0) > 0 && (
        <Card className="border-cyan-300 bg-cyan-50 animate-pulse">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-500 rounded-full">
                  <Send className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-cyan-800">
                    {stats?.users?.kyc_email_pending} User(s) Sent KYC via Email
                  </p>
                  <p className="text-sm text-cyan-700">Review their documents and approve/reject KYC</p>
                </div>
              </div>
              <Button size="sm" onClick={() => window.location.href = "/admin/kyc"}>
                Review Now
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Analytics Overview with Period Filter */}
      <Card className="border-primary/30" data-testid="analytics-overview-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Financial Analytics
            </CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Period:</span>
              <Select value={analyticsPeriod} onValueChange={handlePeriodChange}>
                <SelectTrigger className="w-32" data-testid="analytics-period-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{analytics?.period_label || "Today"}</p>
        </CardHeader>
        <CardContent>
          {/* Main Financial Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {/* Total Wallet Balance */}
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-4 text-white" data-testid="total-wallet-balance">
              <div className="flex items-center gap-2 mb-2">
                <Wallet className="h-5 w-5 opacity-80" />
                <span className="text-sm opacity-90">Total Wallet Balance</span>
              </div>
              <p className="text-2xl font-bold tabular-nums">{formatCurrency(analytics?.wallet_totals?.total_balance)}</p>
              <p className="text-xs opacity-75 mt-1">{analytics?.wallet_totals?.wallet_count || 0} wallets</p>
            </div>
            
            {/* Total Deposits */}
            <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-4 text-white" data-testid="total-deposits">
              <div className="flex items-center gap-2 mb-2">
                <ArrowDownLeft className="h-5 w-5 opacity-80" />
                <span className="text-sm opacity-90">Total Deposits</span>
              </div>
              <p className="text-2xl font-bold tabular-nums">{formatCurrency(analytics?.deposits?.total_amount)}</p>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs opacity-75">{analytics?.deposits?.count || 0} transactions</span>
                <span className={`text-xs px-2 py-0.5 rounded ${analytics?.deposits?.change_percent >= 0 ? "bg-white/20" : "bg-red-400/30"}`}>
                  {analytics?.deposits?.change_percent >= 0 ? "+" : ""}{analytics?.deposits?.change_percent || 0}%
                </span>
              </div>
            </div>
            
            {/* Total Withdrawals */}
            <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl p-4 text-white" data-testid="total-withdrawals">
              <div className="flex items-center gap-2 mb-2">
                <ArrowUpRight className="h-5 w-5 opacity-80" />
                <span className="text-sm opacity-90">Total Withdrawals</span>
              </div>
              <p className="text-2xl font-bold tabular-nums">{formatCurrency(analytics?.withdrawals?.total_amount)}</p>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs opacity-75">{analytics?.withdrawals?.count || 0} transactions</span>
                <span className={`text-xs px-2 py-0.5 rounded ${analytics?.withdrawals?.change_percent <= 0 ? "bg-white/20" : "bg-red-400/30"}`}>
                  {analytics?.withdrawals?.change_percent >= 0 ? "+" : ""}{analytics?.withdrawals?.change_percent || 0}%
                </span>
              </div>
            </div>
            
            {/* Total Revenue */}
            <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl p-4 text-white" data-testid="total-revenue">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-5 w-5 opacity-80" />
                <span className="text-sm opacity-90">Total Revenue</span>
              </div>
              <p className="text-2xl font-bold tabular-nums">{formatCurrency(analytics?.revenue?.total)}</p>
              <p className="text-xs opacity-75 mt-1">Fees + Interest + Commission</p>
            </div>
          </div>
          
          {/* Revenue Breakdown */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="bg-slate-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Revenue Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                    Transaction Fees
                  </span>
                  <span className="font-semibold tabular-nums">{formatCurrency(analytics?.revenue?.breakdown?.transaction_fees)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    Loan Interest
                  </span>
                  <span className="font-semibold tabular-nums">{formatCurrency(analytics?.revenue?.breakdown?.loan_interest)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-orange-500" />
                    Airtime Commission
                  </span>
                  <span className="font-semibold tabular-nums">{formatCurrency(analytics?.revenue?.breakdown?.airtime_commission)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-purple-500" />
                    Other Revenue
                  </span>
                  <span className="font-semibold tabular-nums">{formatCurrency(analytics?.revenue?.breakdown?.other)}</span>
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium">Interest Paid (Expense)</span>
                  <span className="font-semibold tabular-nums text-red-600">-{formatCurrency(analytics?.expenses?.interest_paid)}</span>
                </div>
              </CardContent>
            </Card>
            
            <Card className="bg-slate-50">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Period Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Net Cash Flow</span>
                  <span className={`font-bold tabular-nums ${analytics?.net_flow >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {analytics?.net_flow >= 0 ? "+" : ""}{formatCurrency(analytics?.net_flow)}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">New Users</span>
                  <span className="font-semibold">{analytics?.users?.new_in_period || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Active Users</span>
                  <span className="font-semibold">{analytics?.users?.active_in_period || 0}</span>
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Airtime Sales</span>
                  <span className="font-semibold tabular-nums">{formatCurrency(analytics?.airtime?.volume)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Airtime Transactions</span>
                  <span className="font-semibold">{analytics?.airtime?.count || 0}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* System Settings Overview */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Settings className="h-6 w-6 text-primary" />
              <div>
                <p className="font-semibold">System Configuration</p>
                <div className="flex gap-4 text-sm mt-1">
                  <span>
                    Deposit Mode: <Badge className={systemSettings?.deposit_mode === "stk_push" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}>
                      {systemSettings?.deposit_mode === "stk_push" ? "STK Push" : "Manual"}
                    </Badge>
                  </span>
                  <span>
                    Withdrawal Mode: <Badge className={systemSettings?.withdrawal_mode === "automatic" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}>
                      {systemSettings?.withdrawal_mode === "automatic" ? "Automatic" : "Manual"}
                    </Badge>
                  </span>
                </div>
              </div>
            </div>
            {stats?.admin_role === "super_admin" && (
              <Button variant="outline" size="sm" onClick={() => window.location.href = "/admin/settings"}>
                <Edit className="h-4 w-4 mr-2" />
                Configure
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((stat, i) => (
          <Card key={i} data-testid={`stat-${stat.label.toLowerCase().replace(" ", "-")}`}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${stat.color}`}>
                  <stat.icon className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Loan Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Disbursed</span>
              <span className="font-bold tabular-nums">
                KES {(stats?.loans?.total_disbursed || 0).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Pending Applications</span>
              <span className="font-bold">{stats?.loans?.pending || 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Active Loans</span>
              <span className="font-bold">{stats?.loans?.active || 0}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Savings Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Lock Savings</span>
              <span className="font-bold tabular-nums">
                KES {(stats?.savings?.total_lock_savings || 0).toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total MMF</span>
              <span className="font-bold tabular-nums">
                KES {(stats?.savings?.total_mmf || 0).toLocaleString()}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Instalipa Airtime Section */}
      <Card className="border-orange-200 bg-orange-50/50" data-testid="instalipa-balance-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-orange-600" />
            Instalipa Airtime
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg p-4 border">
              <p className="text-sm text-muted-foreground">Instalipa Balance</p>
              <p className="text-2xl font-bold tabular-nums text-orange-600" data-testid="instalipa-balance">
                {stats?.instalipa?.configured 
                  ? `KES ${stats?.instalipa?.balance || "N/A"}`
                  : "Not Configured"}
              </p>
              {stats?.instalipa?.balance_updated_at && (
                <p className="text-xs text-muted-foreground mt-1">
                  Updated: {new Date(stats?.instalipa?.balance_updated_at).toLocaleString()}
                </p>
              )}
            </div>
            <div className="bg-white rounded-lg p-4 border">
              <p className="text-sm text-muted-foreground">Today's Airtime Sales</p>
              <p className="text-2xl font-bold tabular-nums" data-testid="today-airtime-count">
                {stats?.instalipa?.today_count || 0} purchases
              </p>
              <p className="text-sm text-green-600 font-semibold">
                KES {(stats?.instalipa?.today_total || 0).toLocaleString()}
              </p>
            </div>
            <div className="bg-white rounded-lg p-4 border flex flex-col justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge className={stats?.instalipa?.configured ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}>
                  {stats?.instalipa?.configured ? "Active" : "Credentials Required"}
                </Badge>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-2"
                onClick={() => window.location.href = "/admin/airtime"}
                data-testid="view-airtime-transactions-btn"
              >
                View Transactions
              </Button>
            </div>
          </div>
          {!stats?.instalipa?.configured && (
            <div className="mt-4 p-3 bg-amber-100 rounded-lg text-sm text-amber-800">
              <p className="font-medium">Instalipa credentials not configured</p>
              <p>Add INSTALIPA_CONSUMER_KEY and INSTALIPA_CONSUMER_SECRET to your backend .env file to enable live airtime purchases.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// ================== ADMIN AIRTIME PAGE ==================

const AdminAirtimePage = () => {
  const { adminToken } = useAuth();
  const [status, setStatus] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ status: "", network: "" });

  const fetchData = async () => {
    try {
      const [statusRes, txnRes] = await Promise.all([
        apiCall("GET", "/admin/instalipa/status", null, adminToken),
        apiCall("GET", `/admin/airtime/transactions?limit=100${filter.status ? `&status=${filter.status}` : ""}${filter.network ? `&network=${filter.network}` : ""}`, null, adminToken)
      ]);
      setStatus(statusRes);
      setTransactions(txnRes.transactions || []);
    } catch (err) {
      toast.error("Failed to load airtime data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [adminToken, filter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="admin-airtime-page">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-3xl font-bold">Airtime Management</h2>
        <Button variant="outline" onClick={fetchData} data-testid="refresh-airtime-btn">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Instalipa Status Card */}
      <Card className={status?.configured ? "border-green-200 bg-green-50/50" : "border-amber-200 bg-amber-50/50"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className={status?.configured ? "text-green-600" : "text-amber-600"} />
            Instalipa Integration Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg p-4 border">
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge className={status?.configured ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}>
                {status?.configured ? "Active" : "Not Configured"}
              </Badge>
            </div>
            <div className="bg-white rounded-lg p-4 border">
              <p className="text-sm text-muted-foreground">Instalipa Balance</p>
              <p className="text-xl font-bold tabular-nums text-orange-600" data-testid="admin-instalipa-balance">
                KES {status?.balance || "N/A"}
              </p>
              {status?.balance_updated_at && (
                <p className="text-xs text-muted-foreground">
                  {new Date(status?.balance_updated_at).toLocaleString()}
                </p>
              )}
            </div>
            <div className="bg-white rounded-lg p-4 border">
              <p className="text-sm text-muted-foreground">Today</p>
              <p className="text-xl font-bold">{status?.today?.count || 0} purchases</p>
              <p className="text-sm text-green-600">KES {(status?.today?.total_amount || 0).toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-lg p-4 border">
              <p className="text-sm text-muted-foreground">All Time</p>
              <p className="text-xl font-bold">{status?.all_time?.count || 0} purchases</p>
              <p className="text-sm text-green-600">KES {(status?.all_time?.total_amount || 0).toLocaleString()}</p>
            </div>
          </div>

          {/* Network Breakdown */}
          <div className="mt-4 grid md:grid-cols-2 gap-4">
            <div className="bg-white rounded-lg p-4 border flex items-center gap-4">
              <div className="p-3 bg-green-100 rounded-full">
                <Phone className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Safaricom Total</p>
                <p className="text-xl font-bold tabular-nums">KES {(status?.all_time?.safaricom_total || 0).toLocaleString()}</p>
              </div>
            </div>
            <div className="bg-white rounded-lg p-4 border flex items-center gap-4">
              <div className="p-3 bg-red-100 rounded-full">
                <Phone className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Airtel Total</p>
                <p className="text-xl font-bold tabular-nums">KES {(status?.all_time?.airtel_total || 0).toLocaleString()}</p>
              </div>
            </div>
          </div>

          {!status?.configured && (
            <div className="mt-4 p-4 bg-amber-100 rounded-lg">
              <p className="font-semibold text-amber-800">Instalipa Credentials Required</p>
              <p className="text-sm text-amber-700 mt-1">
                Add the following to your backend .env file:
              </p>
              <pre className="mt-2 bg-amber-50 p-2 rounded text-xs font-mono">
{`INSTALIPA_CONSUMER_KEY=your_consumer_key
INSTALIPA_CONSUMER_SECRET=your_consumer_secret`}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Select value={filter.status} onValueChange={(v) => setFilter(f => ({ ...f, status: v }))}>
              <SelectTrigger className="w-40" data-testid="filter-status">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Status</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filter.network} onValueChange={(v) => setFilter(f => ({ ...f, network: v }))}>
              <SelectTrigger className="w-40" data-testid="filter-network">
                <SelectValue placeholder="All Networks" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Networks</SelectItem>
                <SelectItem value="safaricom">Safaricom</SelectItem>
                <SelectItem value="airtel">Airtel</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => setFilter({ status: "", network: "" })}>
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Airtime Transactions ({transactions.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            {transactions.length > 0 ? (
              <div className="space-y-3">
                {transactions.map((txn, i) => (
                  <div key={i} className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50">
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-full ${txn.network === "safaricom" ? "bg-green-100" : "bg-red-100"}`}>
                        <Phone className={`h-5 w-5 ${txn.network === "safaricom" ? "text-green-600" : "text-red-600"}`} />
                      </div>
                      <div>
                        <p className="font-semibold">{txn.phone_number}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{txn.user_name || "Unknown User"}</span>
                          <span>•</span>
                          <span>{txn.user_phone}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(txn.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg tabular-nums">KES {txn.amount?.toLocaleString()}</p>
                      <div className="flex items-center gap-2 justify-end">
                        <Badge variant="outline">
                          {txn.network === "safaricom" ? "Safaricom" : "Airtel"}
                        </Badge>
                        <Badge 
                          className={
                            txn.status === "completed" ? "bg-green-100 text-green-800" : 
                            txn.status === "pending" ? "bg-amber-100 text-amber-800" : 
                            "bg-red-100 text-red-800"
                          }
                        >
                          {txn.status}
                        </Badge>
                        {txn.simulated && (
                          <Badge variant="outline" className="text-amber-600 border-amber-400">
                            Simulated
                          </Badge>
                        )}
                      </div>
                      {txn.instalipa_transaction_id && (
                        <p className="text-xs text-muted-foreground mt-1">
                          ID: {txn.instalipa_transaction_id}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">No airtime transactions found</p>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};

const AdminKYCPage = () => {
  const { adminToken } = useAuth();
  const [pendingKYC, setPendingKYC] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewDocsOpen, setViewDocsOpen] = useState(null);

  const fetchPendingKYC = async () => {
    try {
      const res = await apiCall("GET", "/admin/kyc/pending", null, adminToken);
      setPendingKYC(res);
    } catch (err) {
      toast.error("Failed to load KYC applications");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingKYC();
  }, [adminToken]);

  const handleApprove = async (kycId) => {
    try {
      await apiCall("PUT", `/admin/kyc/${kycId}/approve`, null, adminToken);
      toast.success("KYC approved!");
      fetchPendingKYC();
    } catch (err) {
      toast.error("Failed to approve KYC");
    }
  };

  const handleReject = async (kycId) => {
    const reason = window.prompt("Enter rejection reason:");
    if (reason === null) return;
    try {
      await apiCall("PUT", `/admin/kyc/${kycId}/reject?reason=${encodeURIComponent(reason)}`, null, adminToken);
      toast.success("KYC rejected");
      fetchPendingKYC();
    } catch (err) {
      toast.error("Failed to reject KYC");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="admin-kyc-page">
      <h2 className="font-heading text-3xl font-bold">KYC Management</h2>

      {pendingKYC.length > 0 ? (
        <div className="grid gap-4">
          {pendingKYC.map((item, i) => (
            <Card key={i} data-testid={`kyc-item-${i}`} className={item.kyc?.status === "email_submitted" ? "border-cyan-300" : ""}>
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-lg">{item.user?.name}</p>
                      {item.kyc?.status === "email_submitted" ? (
                        <Badge className="bg-cyan-500">Email Submitted</Badge>
                      ) : (
                        <Badge variant="secondary">Pending</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{item.user?.phone}</p>
                    
                    {/* Email Submission Notice */}
                    {item.kyc?.status === "email_submitted" && (
                      <div className="p-3 bg-cyan-50 border border-cyan-200 rounded-lg">
                        <div className="flex items-center gap-2 text-cyan-700">
                          <Send className="h-4 w-4" />
                          <span className="text-sm font-medium">User confirmed sending documents via email</span>
                        </div>
                        <p className="text-xs text-cyan-600 mt-1">
                          Confirmed at: {item.kyc?.email_submission_confirmed_at ? new Date(item.kyc.email_submission_confirmed_at).toLocaleString() : 'N/A'}
                        </p>
                        <p className="text-xs text-cyan-600">
                          Check your KYC email inbox for documents from {item.user?.phone}
                        </p>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-2 gap-4 mt-2 text-sm">
                      <div>
                        <p className="text-muted-foreground">ID Type</p>
                        <p className="font-medium">{item.kyc?.id_type?.replace("_", " ").toUpperCase() || "N/A"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">ID Number</p>
                        <p className="font-medium">{item.kyc?.id_number || "N/A"}</p>
                      </div>
                      {item.kyc?.business_name && (
                        <div>
                          <p className="text-muted-foreground">Business</p>
                          <p className="font-medium">{item.kyc.business_name}</p>
                        </div>
                      )}
                    </div>
                    
                    {/* Uploaded Documents Section */}
                    {item.uploads && item.uploads.length > 0 && (
                      <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center gap-2 text-green-700 mb-2">
                          <Upload className="h-4 w-4" />
                          <span className="font-medium text-sm">{item.uploads.length} Document(s) Uploaded</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {item.uploads.map((doc, idx) => (
                            <Badge key={idx} variant="outline" className="bg-white">
                              {doc.document_type?.replace("_", " ")}
                            </Badge>
                          ))}
                        </div>
                        <Dialog open={viewDocsOpen === i} onOpenChange={(open) => setViewDocsOpen(open ? i : null)}>
                          <DialogTrigger asChild>
                            <Button variant="link" size="sm" className="mt-2 p-0 h-auto text-green-700">
                              <Eye className="h-4 w-4 mr-1" />
                              View Documents
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>KYC Documents - {item.user?.name}</DialogTitle>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                              {item.uploads.map((doc, idx) => (
                                <div key={idx} className="flex items-center justify-between p-3 border rounded-lg">
                                  <div className="flex items-center gap-3">
                                    <div className="p-2 bg-primary/10 rounded">
                                      <Image className="h-5 w-5 text-primary" />
                                    </div>
                                    <div>
                                      <p className="font-medium capitalize">{doc.document_type?.replace("_", " ")}</p>
                                      <p className="text-xs text-muted-foreground">{doc.original_filename}</p>
                                    </div>
                                  </div>
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={() => window.open(`${API}${doc.url}`, '_blank')}
                                  >
                                    <ExternalLink className="h-4 w-4 mr-1" />
                                    Open
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    )}
                    
                    {/* URL-based Documents */}
                    {(item.kyc?.id_front_url || item.kyc?.id_back_url) && (!item.uploads || item.uploads.length === 0) && (
                      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-center gap-2 text-blue-700 mb-2">
                          <ExternalLink className="h-4 w-4" />
                          <span className="font-medium text-sm">Document URLs Provided</span>
                        </div>
                        <div className="space-y-1 text-sm">
                          {item.kyc?.id_front_url && (
                            <a href={item.kyc.id_front_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline block truncate">
                              ID Front: {item.kyc.id_front_url}
                            </a>
                          )}
                          {item.kyc?.id_back_url && (
                            <a href={item.kyc.id_back_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline block truncate">
                              ID Back: {item.kyc.id_back_url}
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => handleReject(item.kyc.id)} data-testid={`reject-kyc-${i}`}>
                      Reject
                    </Button>
                    <Button onClick={() => handleApprove(item.kyc.id)} data-testid={`approve-kyc-${i}`}>
                      Approve
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No pending KYC applications</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

const AdminLoansPage = () => {
  const { adminToken } = useAuth();
  const [pendingLoans, setPendingLoans] = useState([]);
  const [usersWithLoans, setUsersWithLoans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("pending");
  const [editLimitUser, setEditLimitUser] = useState(null);
  const [newLimit, setNewLimit] = useState("");

  const fetchData = async () => {
    try {
      const [pendingRes, usersRes] = await Promise.all([
        apiCall("GET", "/admin/loans/pending", null, adminToken),
        apiCall("GET", "/admin/users/with-loans", null, adminToken)
      ]);
      setPendingLoans(pendingRes);
      setUsersWithLoans(usersRes);
    } catch (err) {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [adminToken]);

  const handleApprove = async (loanId) => {
    try {
      await apiCall("PUT", `/admin/loans/${loanId}/approve`, null, adminToken);
      toast.success("Loan approved and disbursed!");
      fetchData();
    } catch (err) {
      toast.error("Failed to approve loan");
    }
  };

  const handleReject = async (loanId) => {
    const reason = window.prompt("Enter rejection reason:");
    if (reason === null) return;
    try {
      await apiCall("PUT", `/admin/loans/${loanId}/reject?reason=${encodeURIComponent(reason)}`, null, adminToken);
      toast.success("Loan rejected");
      fetchData();
    } catch (err) {
      toast.error("Failed to reject loan");
    }
  };

  const handleUpdateLoanLimit = async () => {
    if (!newLimit || parseFloat(newLimit) < 0) {
      toast.error("Enter a valid loan limit");
      return;
    }
    try {
      await apiCall("PUT", `/admin/users/${editLimitUser.user.id}/loan-limit`, { loan_limit: parseFloat(newLimit) }, adminToken);
      toast.success(`Loan limit updated to KES ${parseFloat(newLimit).toLocaleString()}`);
      setEditLimitUser(null);
      setNewLimit("");
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to update loan limit");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="admin-loans-page">
      <h2 className="font-heading text-3xl font-bold">Loan Management</h2>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Applications ({pendingLoans.length})
          </TabsTrigger>
          <TabsTrigger value="repayments" className="flex items-center gap-2">
            <Banknote className="h-4 w-4" />
            Repayments
          </TabsTrigger>
          <TabsTrigger value="limits" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Loan Limits ({usersWithLoans.length})
          </TabsTrigger>
        </TabsList>

        {/* Pending Loans Tab */}
        <TabsContent value="pending" className="mt-4">
          {pendingLoans.length > 0 ? (
            <div className="grid gap-4">
              {pendingLoans.map((item, i) => (
                <Card key={i} data-testid={`loan-item-${i}`}>
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-lg">{item.user?.name}</p>
                          <Badge variant="secondary">{item.loan?.loan_type?.replace("_", " ").toUpperCase()}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{item.user?.phone}</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2 text-sm">
                          <div>
                            <p className="text-muted-foreground">Amount</p>
                            <p className="font-bold tabular-nums">KES {item.loan?.amount?.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Loan Limit</p>
                            <p className="font-medium tabular-nums">KES {(item.user?.loan_limit || 0).toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Term</p>
                            <p className="font-medium">{item.loan?.term_months} months</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Monthly</p>
                            <p className="font-medium tabular-nums">KES {item.loan?.monthly_payment?.toLocaleString()}</p>
                          </div>
                        </div>
                        <p className="text-sm"><span className="text-muted-foreground">Purpose:</span> {item.loan?.purpose}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => handleReject(item.loan.id)} data-testid={`reject-loan-${i}`}>
                          Reject
                        </Button>
                        <Button onClick={() => handleApprove(item.loan.id)} data-testid={`approve-loan-${i}`}>
                          Approve & Disburse
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No pending loan applications</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Loan Limits Tab */}
        <TabsContent value="limits" className="mt-4">
          <Card className="mb-4 bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <p className="text-sm text-blue-800">
                <strong>Loan Limits:</strong> Set the maximum amount each user can borrow. Users with KYC approved but no loan limit cannot apply for loans.
              </p>
            </CardContent>
          </Card>

          {usersWithLoans.length > 0 ? (
            <div className="grid gap-3">
              {usersWithLoans.map((item, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{item.user?.name}</p>
                          {item.has_active_loan && (
                            <Badge className="bg-amber-100 text-amber-800">Active Loan</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{item.user?.phone}</p>
                        <div className="flex items-center gap-4 mt-1 text-sm">
                          <span>
                            Loan Limit: <strong className={`tabular-nums ${item.loan_limit > 0 ? "text-green-600" : "text-red-500"}`}>
                              KES {(item.loan_limit || 0).toLocaleString()}
                            </strong>
                          </span>
                          {item.total_loans > 0 && (
                            <span className="text-muted-foreground">
                              History: {item.repaid_loans}/{item.total_loans} repaid
                            </span>
                          )}
                          {item.has_active_loan && (
                            <span className="text-amber-600">
                              Active: KES {item.active_loan_amount?.toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <Dialog open={editLimitUser?.user?.id === item.user?.id} onOpenChange={(open) => {
                        if (!open) {
                          setEditLimitUser(null);
                          setNewLimit("");
                        }
                      }}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="sm" onClick={() => {
                            setEditLimitUser(item);
                            setNewLimit(item.loan_limit?.toString() || "0");
                          }}>
                            <Edit className="h-4 w-4 mr-1" />
                            Set Limit
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Set Loan Limit</DialogTitle>
                            <DialogDescription>
                              Set loan limit for <strong>{editLimitUser?.user?.name}</strong>
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              <Label>Current Limit</Label>
                              <p className="text-lg font-bold tabular-nums">KES {(editLimitUser?.loan_limit || 0).toLocaleString()}</p>
                            </div>
                            <div className="space-y-2">
                              <Label>New Loan Limit (KES)</Label>
                              <Input
                                type="number"
                                placeholder="e.g., 100000"
                                value={newLimit}
                                onChange={(e) => setNewLimit(e.target.value)}
                                data-testid="new-limit-input"
                              />
                              <p className="text-xs text-muted-foreground">Set to 0 to revoke loan access</p>
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setEditLimitUser(null)}>Cancel</Button>
                            <Button onClick={handleUpdateLoanLimit}>Update Limit</Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No KYC-approved users yet</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Loan Repayments Tab */}
        <TabsContent value="repayments" className="mt-4">
          <AdminLoanRepaymentsSection adminToken={adminToken} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

// Admin Loan Repayments Section Component
const AdminLoanRepaymentsSection = ({ adminToken }) => {
  const [repayments, setRepayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [overpaymentDialog, setOverpaymentDialog] = useState(null);
  const [overpaymentAction, setOverpaymentAction] = useState("credit_wallet");
  const [overpaymentNotes, setOverpaymentNotes] = useState("");

  const fetchRepayments = async () => {
    try {
      const res = await apiCall("GET", "/admin/loan-repayments/pending", null, adminToken);
      setRepayments(res);
    } catch (err) {
      toast.error("Failed to load repayments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRepayments();
  }, [adminToken]);

  const handleApprove = async (repayment) => {
    // If overpayment, need to show dialog for action selection
    if (repayment.repayment.is_overpayment && repayment.repayment.overpayment_amount > 0) {
      setOverpaymentDialog(repayment);
      return;
    }

    try {
      await apiCall("PUT", `/admin/loan-repayments/${repayment.repayment.id}/approve`, null, adminToken);
      toast.success("Repayment approved!");
      fetchRepayments();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to approve");
    }
  };

  const handleApproveWithOverpayment = async () => {
    try {
      await apiCall("PUT", `/admin/loan-repayments/${overpaymentDialog.repayment.id}/approve`, {
        action: overpaymentAction,
        notes: overpaymentNotes
      }, adminToken);
      toast.success("Repayment approved with overpayment handled!");
      setOverpaymentDialog(null);
      setOverpaymentNotes("");
      fetchRepayments();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to approve");
    }
  };

  const handleReject = async (repaymentId) => {
    const reason = window.prompt("Enter rejection reason:");
    if (reason === null) return;
    try {
      await apiCall("PUT", `/admin/loan-repayments/${repaymentId}/reject?reason=${encodeURIComponent(reason)}`, null, adminToken);
      toast.success("Repayment rejected");
      fetchRepayments();
    } catch (err) {
      toast.error("Failed to reject");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <RefreshCw className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      {repayments.length > 0 ? (
        <div className="grid gap-4">
          {repayments.map((item, i) => (
            <Card key={i} data-testid={`repayment-item-${i}`}>
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-lg">{item.repayment?.user_name}</p>
                      <Badge variant="outline">{item.repayment?.repayment_method?.toUpperCase()}</Badge>
                      {item.repayment?.is_partial && (
                        <Badge className="bg-blue-100 text-blue-800">Partial</Badge>
                      )}
                      {item.repayment?.is_overpayment && (
                        <Badge className="bg-amber-100 text-amber-800">Overpayment</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{item.repayment?.user_phone}</p>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">Repayment Amount</p>
                        <p className="font-bold tabular-nums">KES {item.repayment?.amount?.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Outstanding Before</p>
                        <p className="font-medium tabular-nums">KES {item.repayment?.outstanding_before?.toLocaleString()}</p>
                      </div>
                      {item.repayment?.is_overpayment && (
                        <div>
                          <p className="text-muted-foreground">Excess Amount</p>
                          <p className="font-bold tabular-nums text-amber-600">KES {item.repayment?.overpayment_amount?.toLocaleString()}</p>
                        </div>
                      )}
                      {item.repayment?.repayment_method === "mpesa" && (
                        <div>
                          <p className="text-muted-foreground">MPESA Ref</p>
                          <p className="font-mono font-medium">{item.repayment?.mpesa_ref}</p>
                        </div>
                      )}
                    </div>

                    {/* Loan Info */}
                    <div className="mt-3 p-3 bg-slate-50 rounded-lg">
                      <p className="text-xs text-muted-foreground mb-1">Loan Details</p>
                      <div className="flex gap-4 text-sm">
                        <span>Original: <strong>KES {item.loan?.amount?.toLocaleString()}</strong></span>
                        <span>Total Due: <strong>KES {item.loan?.total_repayment?.toLocaleString()}</strong></span>
                        <span>Outstanding: <strong className="text-red-600">KES {item.loan?.outstanding_balance?.toLocaleString()}</strong></span>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Submitted: {new Date(item.repayment?.created_at).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => handleReject(item.repayment?.id)}>
                      Reject
                    </Button>
                    <Button onClick={() => handleApprove(item)}>
                      {item.repayment?.is_overpayment ? "Review & Approve" : "Approve"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Banknote className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No pending loan repayments</p>
          </CardContent>
        </Card>
      )}

      {/* Overpayment Decision Dialog */}
      <Dialog open={!!overpaymentDialog} onOpenChange={() => setOverpaymentDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Handle Overpayment</DialogTitle>
            <DialogDescription>
              This repayment exceeds the outstanding balance by <strong>KES {overpaymentDialog?.repayment?.overpayment_amount?.toLocaleString()}</strong>. 
              How should the excess be handled?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <div 
                className={`p-4 border rounded-lg cursor-pointer transition-colors ${overpaymentAction === "credit_wallet" ? "border-primary bg-primary/5" : "hover:bg-slate-50"}`}
                onClick={() => setOverpaymentAction("credit_wallet")}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded-full border-2 ${overpaymentAction === "credit_wallet" ? "border-primary bg-primary" : "border-slate-300"}`} />
                  <Wallet className="h-4 w-4" />
                  <span className="font-semibold">Credit to Wallet</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1 ml-6">
                  Add excess KES {overpaymentDialog?.repayment?.overpayment_amount?.toLocaleString()} to user's wallet balance
                </p>
              </div>
              
              <div 
                className={`p-4 border rounded-lg cursor-pointer transition-colors ${overpaymentAction === "hold_advance" ? "border-primary bg-primary/5" : "hover:bg-slate-50"}`}
                onClick={() => setOverpaymentAction("hold_advance")}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded-full border-2 ${overpaymentAction === "hold_advance" ? "border-primary bg-primary" : "border-slate-300"}`} />
                  <PiggyBank className="h-4 w-4" />
                  <span className="font-semibold">Hold as Loan Advance</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1 ml-6">
                  Keep excess as advance for user's future loans
                </p>
              </div>

              <div 
                className={`p-4 border rounded-lg cursor-pointer transition-colors ${overpaymentAction === "refund" ? "border-primary bg-primary/5" : "hover:bg-slate-50"}`}
                onClick={() => setOverpaymentAction("refund")}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded-full border-2 ${overpaymentAction === "refund" ? "border-primary bg-primary" : "border-slate-300"}`} />
                  <Send className="h-4 w-4" />
                  <span className="font-semibold">Manual Refund</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1 ml-6">
                  Record decision and process refund manually
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Admin Notes (Optional)</Label>
              <Input
                placeholder="Add notes about this decision..."
                value={overpaymentNotes}
                onChange={(e) => setOverpaymentNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverpaymentDialog(null)}>Cancel</Button>
            <Button onClick={handleApproveWithOverpayment}>Approve & Handle Overpayment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

const AdminRatesPage = () => {
  const { adminToken } = useAuth();
  const [rates, setRates] = useState([]);
  const [mmfAccounts, setMmfAccounts] = useState([]);
  const [lockSavings, setLockSavings] = useState([]);
  const [interestHistory, setInterestHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("rates");
  const [applyingAll, setApplyingAll] = useState(false);

  const fetchData = async () => {
    try {
      const [ratesRes, mmfRes, savingsRes, historyRes] = await Promise.all([
        apiCall("GET", "/admin/interest-rates", null, adminToken),
        apiCall("GET", "/admin/savings/mmf-accounts", null, adminToken),
        apiCall("GET", "/admin/savings/lock-savings", null, adminToken),
        apiCall("GET", "/admin/interest/history?limit=20", null, adminToken)
      ]);
      setRates(ratesRes);
      setMmfAccounts(mmfRes);
      setLockSavings(savingsRes);
      setInterestHistory(historyRes.logs || []);
    } catch (err) {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [adminToken]);

  const handleUpdateRate = async (rateType, newRate) => {
    try {
      await apiCall("PUT", "/admin/interest-rates", { rate_type: rateType, rate: parseFloat(newRate) }, adminToken);
      toast.success("Rate updated!");
      fetchData();
    } catch (err) {
      toast.error("Failed to update rate");
    }
  };

  const handleApplyMMFInterest = async (userId) => {
    try {
      const res = await apiCall("POST", `/admin/interest/apply-mmf/${userId}`, null, adminToken);
      toast.success(`Interest KES ${res.interest_earned} applied!`);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to apply interest");
    }
  };

  const handleApplyLockSavingsInterest = async (savingId) => {
    try {
      const res = await apiCall("POST", `/admin/interest/apply-lock-savings/${savingId}`, null, adminToken);
      toast.success(`Interest KES ${res.interest_earned} applied!`);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to apply interest");
    }
  };

  const handleApplyAllMMF = async () => {
    if (!window.confirm("Apply daily interest to ALL MMF accounts? This action cannot be undone.")) return;
    setApplyingAll(true);
    try {
      const res = await apiCall("POST", "/admin/interest/apply-all-mmf", null, adminToken);
      toast.success(`Interest applied to ${res.processed} accounts! Total: KES ${res.total_interest}`);
      fetchData();
    } catch (err) {
      toast.error("Failed to apply batch interest");
    } finally {
      setApplyingAll(false);
    }
  };

  const handleApplyAllLockSavings = async () => {
    if (!window.confirm("Apply daily interest to ALL active lock savings? This action cannot be undone.")) return;
    setApplyingAll(true);
    try {
      const res = await apiCall("POST", "/admin/interest/apply-all-lock-savings", null, adminToken);
      toast.success(`Interest applied to ${res.processed} accounts! Total: KES ${res.total_interest}`);
      fetchData();
    } catch (err) {
      toast.error("Failed to apply batch interest");
    } finally {
      setApplyingAll(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="admin-rates-page">
      <h2 className="font-heading text-3xl font-bold">Interest Rate & Accrual Management</h2>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="rates" className="flex items-center gap-2">
            <Percent className="h-4 w-4" />
            Interest Rates
          </TabsTrigger>
          <TabsTrigger value="mmf" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            MMF Accounts ({mmfAccounts.length})
          </TabsTrigger>
          <TabsTrigger value="lock" className="flex items-center gap-2">
            <PiggyBank className="h-4 w-4" />
            Lock Savings ({lockSavings.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            History
          </TabsTrigger>
        </TabsList>

        {/* Interest Rates Tab */}
        <TabsContent value="rates" className="mt-4">
          <div className="grid gap-4">
            {rates.map((rate, i) => (
              <Card key={i} data-testid={`rate-${rate.rate_type}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{rate.description || rate.rate_type}</p>
                      <p className="text-sm text-muted-foreground">Type: {rate.rate_type}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Input
                        type="number"
                        step="0.1"
                        className="w-24 text-right"
                        defaultValue={rate.rate}
                        onBlur={(e) => {
                          if (e.target.value !== rate.rate.toString()) {
                            handleUpdateRate(rate.rate_type, e.target.value);
                          }
                        }}
                        data-testid={`rate-input-${rate.rate_type}`}
                      />
                      <span className="text-lg font-bold">%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* MMF Accounts Tab */}
        <TabsContent value="mmf" className="mt-4">
          <Card className="mb-4">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">Batch Interest Application</p>
                  <p className="text-sm text-muted-foreground">Apply daily interest to all MMF accounts at once</p>
                </div>
                <Button onClick={handleApplyAllMMF} disabled={applyingAll} className="bg-green-600 hover:bg-green-700">
                  {applyingAll ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
                  Apply to All ({mmfAccounts.length})
                </Button>
              </div>
            </CardContent>
          </Card>

          {mmfAccounts.length > 0 ? (
            <div className="grid gap-3">
              {mmfAccounts.map((item, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{item.user?.name}</p>
                        <p className="text-sm text-muted-foreground">{item.user?.phone}</p>
                        <div className="flex items-center gap-4 mt-1 text-sm">
                          <span>Balance: <strong className="tabular-nums">KES {item.account?.balance?.toLocaleString()}</strong></span>
                          <span>Interest Earned: <strong className="text-green-600 tabular-nums">KES {(item.account?.total_interest_earned || 0).toFixed(2)}</strong></span>
                        </div>
                        {item.account?.last_interest_date && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Last interest: {new Date(item.account.last_interest_date).toLocaleString()}
                          </p>
                        )}
                      </div>
                      <Button size="sm" onClick={() => handleApplyMMFInterest(item.user?.id)}>
                        <Plus className="h-4 w-4 mr-1" />
                        Apply Interest
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No MMF accounts with balance</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Lock Savings Tab */}
        <TabsContent value="lock" className="mt-4">
          <Card className="mb-4">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">Batch Interest Application</p>
                  <p className="text-sm text-muted-foreground">Apply daily interest to all active lock savings at once</p>
                </div>
                <Button onClick={handleApplyAllLockSavings} disabled={applyingAll} className="bg-green-600 hover:bg-green-700">
                  {applyingAll ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
                  Apply to All ({lockSavings.length})
                </Button>
              </div>
            </CardContent>
          </Card>

          {lockSavings.length > 0 ? (
            <div className="grid gap-3">
              {lockSavings.map((item, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold">{item.user?.name}</p>
                          <Badge variant="outline">{item.saving?.term_months} months</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{item.user?.phone}</p>
                        <div className="flex items-center gap-4 mt-1 text-sm">
                          <span>Principal: <strong className="tabular-nums">KES {item.saving?.amount?.toLocaleString()}</strong></span>
                          <span>Current Value: <strong className="text-green-600 tabular-nums">KES {(item.saving?.current_value || item.saving?.amount)?.toLocaleString()}</strong></span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Matures: {new Date(item.saving?.maturity_date).toLocaleDateString()}
                          {item.saving?.last_interest_date && ` • Last interest: ${new Date(item.saving.last_interest_date).toLocaleString()}`}
                        </p>
                      </div>
                      <Button size="sm" onClick={() => handleApplyLockSavingsInterest(item.saving?.id)}>
                        <Plus className="h-4 w-4 mr-1" />
                        Apply Interest
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <PiggyBank className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No active lock savings</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history" className="mt-4">
          {interestHistory.length > 0 ? (
            <div className="grid gap-3">
              {interestHistory.map((log, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge className={log.action?.includes("batch") ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"}>
                            {log.action?.includes("batch") ? "Batch" : "Manual"}
                          </Badge>
                          <Badge variant="outline">
                            {log.action?.includes("mmf") ? "MMF" : "Lock Savings"}
                          </Badge>
                        </div>
                        <p className="text-sm mt-1">{log.details}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(log.created_at).toLocaleString()}
                        </p>
                      </div>
                      {log.amount && (
                        <p className="font-bold text-green-600 tabular-nums">+KES {log.amount?.toFixed(2)}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No interest application history</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

const AdminUsersPage = () => {
  const { adminToken } = useAuth();
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await apiCall("GET", "/admin/users", null, adminToken);
        setUsers(res.users);
        setTotal(res.total);
      } catch (err) {
        toast.error("Failed to load users");
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, [adminToken]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="admin-users-page">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-3xl font-bold">Users</h2>
        <Badge variant="secondary">{total} total</Badge>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-4 font-semibold">Name</th>
                  <th className="text-left p-4 font-semibold">Phone</th>
                  <th className="text-left p-4 font-semibold">KYC Status</th>
                  <th className="text-left p-4 font-semibold">Verified</th>
                  <th className="text-left p-4 font-semibold">Joined</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user, i) => (
                  <tr key={i} className="border-b" data-testid={`user-row-${i}`}>
                    <td className="p-4">{user.name}</td>
                    <td className="p-4 text-muted-foreground">{user.phone}</td>
                    <td className="p-4">
                      <Badge variant={
                        user.kyc_status === "approved" ? "default" :
                        user.kyc_status === "submitted" ? "secondary" : "outline"
                      }>
                        {user.kyc_status}
                      </Badge>
                    </td>
                    <td className="p-4">
                      {user.phone_verified ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600" />
                      )}
                    </td>
                    <td className="p-4 text-muted-foreground text-sm">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ================== ADMIN DEPOSITS PAGE ==================

const AdminDepositsPage = () => {
  const { adminToken } = useAuth();
  const [deposits, setDeposits] = useState([]);
  const [stkRequests, setStkRequests] = useState([]);
  const [systemSettings, setSystemSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("manual");

  const fetchData = async () => {
    try {
      const [depositsRes, stkRes, settingsRes] = await Promise.all([
        apiCall("GET", "/admin/deposits/pending", null, adminToken),
        apiCall("GET", "/admin/stk-requests?status=pending", null, adminToken),
        apiCall("GET", "/admin/system-settings", null, adminToken)
      ]);
      setDeposits(depositsRes);
      setStkRequests(stkRes.requests || []);
      setSystemSettings(settingsRes);
    } catch (err) {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [adminToken]);

  const handleApprove = async (depositId) => {
    try {
      await apiCall("PUT", `/admin/deposits/${depositId}/approve`, null, adminToken);
      toast.success("Deposit approved!");
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to approve");
    }
  };

  const handleReject = async (depositId) => {
    const reason = window.prompt("Enter rejection reason:");
    if (reason === null) return;
    try {
      await apiCall("PUT", `/admin/deposits/${depositId}/reject?reason=${encodeURIComponent(reason)}`, null, adminToken);
      toast.success("Deposit rejected");
      fetchData();
    } catch (err) {
      toast.error("Failed to reject");
    }
  };

  const handleSimulateSTKSuccess = async (requestId) => {
    try {
      await apiCall("POST", `/admin/stk-requests/${requestId}/simulate-success`, null, adminToken);
      toast.success("STK Push success simulated - wallet credited!");
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to simulate");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const depositMode = systemSettings?.settings?.deposit_mode || "manual";

  return (
    <div className="space-y-6" data-testid="admin-deposits-page">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-3xl font-bold">Deposit Management</h2>
        <Badge className={depositMode === "stk_push" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}>
          Mode: {depositMode === "stk_push" ? "STK Push" : "Manual"}
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="manual" className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Manual Deposits ({deposits.length})
          </TabsTrigger>
          <TabsTrigger value="stk" className="flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            STK Requests ({stkRequests.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="manual" className="mt-4">
          {deposits.length > 0 ? (
            <div className="grid gap-4">
              {deposits.map((deposit, i) => (
                <Card key={i} data-testid={`deposit-item-${i}`}>
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-lg">{deposit.user_name}</p>
                          <Badge variant="secondary">Pending</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{deposit.user_phone}</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2 text-sm">
                          <div>
                            <p className="text-muted-foreground">Amount</p>
                            <p className="font-bold tabular-nums">KES {deposit.amount?.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">MPESA Ref</p>
                            <p className="font-mono font-medium">{deposit.mpesa_ref}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Sender</p>
                            <p className="font-medium">{deposit.sender_phone}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Date</p>
                            <p className="font-medium">{new Date(deposit.created_at).toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" onClick={() => handleReject(deposit.id)} data-testid={`reject-deposit-${i}`}>
                          Reject
                        </Button>
                        <Button onClick={() => handleApprove(deposit.id)} data-testid={`approve-deposit-${i}`}>
                          Approve
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Receipt className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No pending manual deposits</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="stk" className="mt-4">
          <div className="bg-amber-50 p-4 rounded-lg border border-amber-200 mb-4">
            <p className="text-sm text-amber-800 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              <span><strong>Note:</strong> STK Push is currently simulated. Use "Simulate Success" to manually credit the wallet for testing.</span>
            </p>
          </div>

          {stkRequests.length > 0 ? (
            <div className="grid gap-4">
              {stkRequests.map((request, i) => (
                <Card key={i} data-testid={`stk-item-${i}`}>
                  <CardContent className="p-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-lg">{request.user_name}</p>
                          <Badge className="bg-amber-100 text-amber-800">STK Pending</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{request.user_phone}</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2 text-sm">
                          <div>
                            <p className="text-muted-foreground">Amount</p>
                            <p className="font-bold tabular-nums">KES {request.amount?.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Pay Phone</p>
                            <p className="font-medium">{request.phone_number}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Checkout ID</p>
                            <p className="font-mono text-xs truncate max-w-[150px]">{request.checkout_request_id}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Date</p>
                            <p className="font-medium">{new Date(request.created_at).toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                      <Button onClick={() => handleSimulateSTKSuccess(request.id)} className="bg-green-600 hover:bg-green-700" data-testid={`simulate-stk-${i}`}>
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Simulate Success
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Smartphone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No pending STK push requests</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

// ================== ADMIN WITHDRAWALS PAGE ==================

const AdminWithdrawalsPage = () => {
  const { adminToken } = useAuth();
  const [withdrawals, setWithdrawals] = useState([]);
  const [systemSettings, setSystemSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [withdrawalsRes, settingsRes] = await Promise.all([
        apiCall("GET", "/admin/withdrawals/pending", null, adminToken),
        apiCall("GET", "/admin/system-settings", null, adminToken)
      ]);
      setWithdrawals(withdrawalsRes);
      setSystemSettings(settingsRes);
    } catch (err) {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [adminToken]);

  const handleApprove = async (withdrawalId) => {
    try {
      await apiCall("PUT", `/admin/withdrawals/${withdrawalId}/approve`, null, adminToken);
      toast.success("Withdrawal approved!");
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to approve");
    }
  };

  const handleReject = async (withdrawalId) => {
    const reason = window.prompt("Enter rejection reason:");
    if (reason === null) return;
    try {
      await apiCall("PUT", `/admin/withdrawals/${withdrawalId}/reject?reason=${encodeURIComponent(reason)}`, null, adminToken);
      toast.success("Withdrawal rejected");
      fetchData();
    } catch (err) {
      toast.error("Failed to reject");
    }
  };

  const handleMarkPaid = async (withdrawalId) => {
    try {
      await apiCall("PUT", `/admin/withdrawals/${withdrawalId}/mark-paid`, null, adminToken);
      toast.success("Withdrawal marked as paid");
      fetchData();
    } catch (err) {
      toast.error("Failed to mark as paid");
    }
  };

  const handleAutoProcess = async (withdrawalId) => {
    try {
      await apiCall("POST", `/admin/withdrawals/${withdrawalId}/process-auto`, null, adminToken);
      toast.success("Withdrawal processed automatically!");
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to process automatically");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const withdrawalMode = systemSettings?.settings?.withdrawal_mode || "manual";

  return (
    <div className="space-y-6" data-testid="admin-withdrawals-page">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-3xl font-bold">Withdrawal Requests</h2>
        <Badge className={withdrawalMode === "automatic" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}>
          Mode: {withdrawalMode === "automatic" ? "Automatic" : "Manual"}
        </Badge>
      </div>

      {withdrawalMode === "automatic" && (
        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <p className="text-sm text-green-800 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            <span><strong>Automatic mode enabled.</strong> Use "Process Auto" to simulate automatic MPESA/bank transfer processing.</span>
          </p>
        </div>
      )}

      {withdrawals.length > 0 ? (
        <div className="grid gap-4">
          {withdrawals.map((withdrawal, i) => (
            <Card key={i} data-testid={`withdrawal-item-${i}`}>
              <CardContent className="p-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-lg">{withdrawal.user_name}</p>
                      <Badge variant="secondary">{withdrawal.withdrawal_type?.toUpperCase()}</Badge>
                      <Badge className={withdrawal.status === "pending" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}>
                        {withdrawal.status === "pending" ? "Pending" : "Approved"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{withdrawal.user_phone}</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-2 text-sm">
                      <div>
                        <p className="text-muted-foreground">Amount</p>
                        <p className="font-bold tabular-nums">KES {withdrawal.amount?.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Destination</p>
                        <p className="font-medium">
                          {withdrawal.withdrawal_type === "mpesa" 
                            ? withdrawal.destination_phone 
                            : `${withdrawal.bank_name} - ${withdrawal.bank_account}`}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Date</p>
                        <p className="font-medium">{new Date(withdrawal.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {withdrawal.status === "pending" && (
                      <>
                        <Button variant="outline" onClick={() => handleReject(withdrawal.id)} data-testid={`reject-withdrawal-${i}`}>
                          Reject
                        </Button>
                        <Button onClick={() => handleApprove(withdrawal.id)} data-testid={`approve-withdrawal-${i}`}>
                          Approve
                        </Button>
                      </>
                    )}
                    {withdrawal.status === "approved" && withdrawalMode === "manual" && (
                      <Button onClick={() => handleMarkPaid(withdrawal.id)} className="bg-green-600 hover:bg-green-700">
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Mark Paid
                      </Button>
                    )}
                    {withdrawalMode === "automatic" && (
                      <Button onClick={() => handleAutoProcess(withdrawal.id)} className="bg-green-600 hover:bg-green-700" data-testid={`auto-process-${i}`}>
                        <Zap className="h-4 w-4 mr-2" />
                        Process Auto
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Send className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No pending withdrawals</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// ================== ADMIN STATEMENTS PAGE ==================

const AdminStatementsPage = () => {
  const { adminToken } = useAuth();
  const [statements, setStatements] = useState([]);
  const [approvedStatements, setApprovedStatements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sendingSms, setSendingSms] = useState({});
  const [downloading, setDownloading] = useState({});

  const fetchStatements = async () => {
    try {
      const [pending, all] = await Promise.all([
        apiCall("GET", "/admin/statements/pending", null, adminToken),
        apiCall("GET", "/admin/statements", null, adminToken)
      ]);
      setStatements(pending);
      // Filter to show generated statements
      const approved = all.filter(s => s.status === "generated");
      setApprovedStatements(approved);
    } catch (err) {
      toast.error("Failed to load statements");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatements();
  }, [adminToken]);

  const handleApprove = async (statementId) => {
    try {
      await apiCall("PUT", `/admin/statements/${statementId}/approve`, null, adminToken);
      toast.success("Statement approved and SMS notification sent!");
      fetchStatements();
    } catch (err) {
      toast.error("Failed to approve");
    }
  };

  const handleReject = async (statementId) => {
    const reason = window.prompt("Enter rejection reason:");
    if (reason === null) return;
    try {
      await apiCall("PUT", `/admin/statements/${statementId}/reject?reason=${encodeURIComponent(reason)}`, null, adminToken);
      toast.success("Statement rejected");
      fetchStatements();
    } catch (err) {
      toast.error("Failed to reject");
    }
  };

  const handleSendSms = async (statementId) => {
    setSendingSms(prev => ({ ...prev, [statementId]: true }));
    try {
      const res = await apiCall("POST", `/admin/statements/${statementId}/send-sms`, null, adminToken);
      toast.success(res.message || "Statement SMS sent!");
      fetchStatements();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to send SMS");
    } finally {
      setSendingSms(prev => ({ ...prev, [statementId]: false }));
    }
  };

  const handleDownloadPdf = async (statementId, userName, startDate, endDate) => {
    setDownloading(prev => ({ ...prev, [statementId]: true }));
    try {
      const API_URL = process.env.REACT_APP_BACKEND_URL;
      const response = await fetch(`${API_URL}/api/admin/statements/${statementId}/download-pdf`, {
        headers: { "Authorization": `Bearer ${adminToken}` }
      });
      
      if (!response.ok) throw new Error("Download failed");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `statement_${userName || "user"}_${startDate}_${endDate}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      toast.success("PDF downloaded!");
    } catch (err) {
      toast.error("Failed to download PDF");
    } finally {
      setDownloading(prev => ({ ...prev, [statementId]: false }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const getDeliveryBadge = (method) => {
    return method === "email" 
      ? <Badge className="bg-blue-100 text-blue-800">Email</Badge>
      : <Badge className="bg-green-100 text-green-800">SMS</Badge>;
  };

  return (
    <div className="space-y-6" data-testid="admin-statements-page">
      <h2 className="font-heading text-3xl font-bold">Statement Requests</h2>

      {/* Pending Statements */}
      <Card>
        <CardHeader>
          <CardTitle>Pending Requests ({statements.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {statements.length > 0 ? (
            <div className="space-y-4">
              {statements.map((item, i) => (
                <div key={i} className="p-4 border rounded-lg" data-testid={`statement-item-${i}`}>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-lg">{item.user?.name}</p>
                        {getDeliveryBadge(item.statement?.delivery_method)}
                      </div>
                      <p className="text-sm text-muted-foreground">{item.user?.phone}</p>
                      <div className="grid grid-cols-2 gap-4 text-sm mt-2">
                        <div>
                          <p className="text-muted-foreground">Date Range</p>
                          <p className="font-medium">{item.statement?.start_date} to {item.statement?.end_date}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Deliver To</p>
                          <p className="font-medium">
                            {item.statement?.delivery_method === "email" 
                              ? item.statement?.delivery_email 
                              : item.statement?.delivery_phone || item.user?.phone}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Requested: {new Date(item.statement?.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => handleReject(item.statement?.id)} data-testid={`reject-statement-${i}`}>
                        Reject
                      </Button>
                      <Button onClick={() => handleApprove(item.statement?.id)} data-testid={`approve-statement-${i}`}>
                        Approve & Generate
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-4">No pending statement requests</p>
          )}
        </CardContent>
      </Card>

      {/* Approved Statements - Delivery Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Approved Statements - Delivery</CardTitle>
          <CardDescription>Send statement via SMS or download PDF for email delivery</CardDescription>
        </CardHeader>
        <CardContent>
          {approvedStatements.length > 0 ? (
            <ScrollArea className="h-[400px]">
              <div className="space-y-4">
                {approvedStatements.map((stmt, i) => (
                  <div key={i} className="p-4 border rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4" data-testid={`approved-statement-${i}`}>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{stmt.user_name || "User"}</p>
                        {getDeliveryBadge(stmt.delivery_method)}
                        {stmt.sms_sent_at && (
                          <Badge variant="outline" className="text-green-600 border-green-400">
                            SMS Sent
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{stmt.user_phone}</p>
                      <p className="text-sm">
                        Period: <span className="font-medium">{stmt.start_date} to {stmt.end_date}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Approved: {new Date(stmt.reviewed_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {stmt.delivery_method === "sms" && (
                        <Button 
                          variant="outline" 
                          onClick={() => handleSendSms(stmt.id)}
                          disabled={sendingSms[stmt.id]}
                          data-testid={`send-sms-${i}`}
                        >
                          {sendingSms[stmt.id] ? (
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Phone className="h-4 w-4 mr-2" />
                          )}
                          {stmt.sms_sent_at ? "Resend SMS" : "Send SMS"}
                        </Button>
                      )}
                      <Button 
                        variant="outline"
                        onClick={() => handleDownloadPdf(stmt.id, stmt.user_name, stmt.start_date, stmt.end_date)}
                        disabled={downloading[stmt.id]}
                        data-testid={`download-pdf-${i}`}
                      >
                        {downloading[stmt.id] ? (
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4 mr-2" />
                        )}
                        Download PDF
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <p className="text-center text-muted-foreground py-4">No approved statements</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// ================== ADMIN WALLET MANAGEMENT PAGE ==================

const AdminWalletPage = () => {
  const { adminToken } = useAuth();
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userWallet, setUserWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const [releaseHoldOpen, setReleaseHoldOpen] = useState(false);
  const [selectedHold, setSelectedHold] = useState(null);
  const [adjustData, setAdjustData] = useState({
    amount: "",
    adjustment_type: "credit",
    reason: ""
  });
  const [holdData, setHoldData] = useState({
    amount: "",
    hold_type: "transaction_fee",
    reason: ""
  });

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await apiCall("GET", "/admin/users?limit=100", null, adminToken);
        setUsers(res.users);
      } catch (err) {
        toast.error("Failed to load users");
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, [adminToken]);

  const handleSelectUser = async (userId) => {
    try {
      const res = await apiCall("GET", `/admin/wallet/${userId}`, null, adminToken);
      setSelectedUser(res.user);
      setUserWallet(res);
    } catch (err) {
      toast.error("Failed to load wallet");
    }
  };

  const handleAdjustWallet = async () => {
    if (!adjustData.amount || !adjustData.reason) {
      toast.error("Amount and reason are required");
      return;
    }
    try {
      await apiCall("POST", "/admin/wallet/adjust", {
        user_id: selectedUser.id,
        amount: parseFloat(adjustData.amount),
        adjustment_type: adjustData.adjustment_type,
        reason: adjustData.reason
      }, adminToken);
      toast.success(`Wallet ${adjustData.adjustment_type}ed successfully`);
      setAdjustOpen(false);
      setAdjustData({ amount: "", adjustment_type: "credit", reason: "" });
      handleSelectUser(selectedUser.id);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to adjust wallet");
    }
  };

  const handleAddHold = async () => {
    if (!holdData.amount || !holdData.reason) {
      toast.error("Amount and reason are required");
      return;
    }
    try {
      await apiCall("POST", "/admin/wallet/hold", {
        user_id: selectedUser.id,
        amount: parseFloat(holdData.amount),
        hold_type: holdData.hold_type,
        reason: holdData.reason
      }, adminToken);
      toast.success("Hold added successfully");
      setHoldOpen(false);
      setHoldData({ amount: "", hold_type: "transaction_fee", reason: "" });
      handleSelectUser(selectedUser.id);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to add hold");
    }
  };

  const handleReleaseHold = async (action) => {
    if (!selectedHold) return;
    try {
      await apiCall("POST", "/admin/wallet/release-hold", {
        user_id: selectedUser.id,
        hold_id: selectedHold.id,
        action: action
      }, adminToken);
      toast.success(`Hold ${action === 'release' ? 'released' : 'deducted'} successfully`);
      setReleaseHoldOpen(false);
      setSelectedHold(null);
      handleSelectUser(selectedUser.id);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to process hold");
    }
  };

  const holdTypeLabels = {
    transaction_fee: "Transaction Fee",
    service_fee: "Service Fee",
    penalty: "Penalty",
    withdrawal_fee: "Withdrawal Fee",
    loan_fee: "Loan Processing Fee",
    other: "Other"
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const activeHolds = userWallet?.wallet?.holds?.filter(h => h.status === 'active') || [];

  return (
    <div className="space-y-6" data-testid="admin-wallet-page">
      <h2 className="font-heading text-3xl font-bold">Wallet Management</h2>

      <div className="grid md:grid-cols-3 gap-6">
        {/* User List */}
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Select User</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]">
              <div className="space-y-2">
                {users.map((user, i) => (
                  <Button
                    key={i}
                    variant={selectedUser?.id === user.id ? "secondary" : "ghost"}
                    className="w-full justify-start"
                    onClick={() => handleSelectUser(user.id)}
                    data-testid={`select-user-${i}`}
                  >
                    <div className="text-left">
                      <p className="font-medium">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.phone}</p>
                    </div>
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Wallet Details */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Wallet Details</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedUser ? (
              <div className="space-y-6">
                {/* User Info & Balance Summary */}
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-lg">{selectedUser.name}</p>
                    <p className="text-muted-foreground">{selectedUser.phone}</p>
                  </div>
                </div>

                {/* Balance Cards */}
                <div className="grid grid-cols-3 gap-4">
                  <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
                    <CardContent className="p-4">
                      <p className="text-emerald-100 text-sm">Actual Balance</p>
                      <p className="font-bold text-2xl tabular-nums">
                        KES {(userWallet?.wallet?.actual_balance || userWallet?.wallet?.balance || 0).toLocaleString()}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
                    <CardContent className="p-4">
                      <p className="text-blue-100 text-sm">Available Balance</p>
                      <p className="font-bold text-2xl tabular-nums">
                        KES {(userWallet?.wallet?.available_balance || 0).toLocaleString()}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-amber-500 to-amber-600 text-white">
                    <CardContent className="p-4">
                      <p className="text-amber-100 text-sm">On Hold</p>
                      <p className="font-bold text-2xl tabular-nums">
                        KES {(userWallet?.wallet?.withheld_amount || 0).toLocaleString()}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
                    <DialogTrigger asChild>
                      <Button className="flex-1" data-testid="adjust-wallet-btn">
                        <Edit className="h-4 w-4 mr-2" />
                        Credit/Debit
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Adjust Wallet - {selectedUser.name}</DialogTitle>
                        <DialogDescription>Credit or debit the user wallet balance</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Type</Label>
                          <Select value={adjustData.adjustment_type} onValueChange={(v) => setAdjustData({ ...adjustData, adjustment_type: v })}>
                            <SelectTrigger data-testid="adjust-type-select">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="credit">Credit (Add to Balance)</SelectItem>
                              <SelectItem value="debit">Debit (Subtract from Balance)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Amount (KES)</Label>
                          <Input
                            type="number"
                            placeholder="e.g., 1000"
                            value={adjustData.amount}
                            onChange={(e) => setAdjustData({ ...adjustData, amount: e.target.value })}
                            data-testid="adjust-amount"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Reason</Label>
                          <Input
                            placeholder="Enter reason for adjustment"
                            value={adjustData.reason}
                            onChange={(e) => setAdjustData({ ...adjustData, reason: e.target.value })}
                            data-testid="adjust-reason"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancel</Button>
                        <Button onClick={handleAdjustWallet} data-testid="confirm-adjust-btn">
                          {adjustData.adjustment_type === "credit" ? "Credit" : "Debit"} Wallet
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>

                  <Dialog open={holdOpen} onOpenChange={setHoldOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="flex-1" data-testid="add-hold-btn">
                        <Lock className="h-4 w-4 mr-2" />
                        Add Hold
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Hold - {selectedUser.name}</DialogTitle>
                        <DialogDescription>Withhold an amount from the user's available balance</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
                          <p className="text-amber-800">
                            <strong>Available to hold:</strong> KES {(userWallet?.wallet?.available_balance || 0).toLocaleString()}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label>Hold Type</Label>
                          <Select value={holdData.hold_type} onValueChange={(v) => setHoldData({ ...holdData, hold_type: v })}>
                            <SelectTrigger data-testid="hold-type-select">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="transaction_fee">Transaction Fee</SelectItem>
                              <SelectItem value="service_fee">Service Fee</SelectItem>
                              <SelectItem value="withdrawal_fee">Withdrawal Fee</SelectItem>
                              <SelectItem value="loan_fee">Loan Processing Fee</SelectItem>
                              <SelectItem value="penalty">Penalty</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Amount (KES)</Label>
                          <Input
                            type="number"
                            placeholder="e.g., 500"
                            value={holdData.amount}
                            onChange={(e) => setHoldData({ ...holdData, amount: e.target.value })}
                            data-testid="hold-amount"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Reason</Label>
                          <Input
                            placeholder="Enter reason for the hold"
                            value={holdData.reason}
                            onChange={(e) => setHoldData({ ...holdData, reason: e.target.value })}
                            data-testid="hold-reason"
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setHoldOpen(false)}>Cancel</Button>
                        <Button onClick={handleAddHold} data-testid="confirm-hold-btn">
                          Add Hold
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>

                <Separator />

                {/* Active Holds */}
                {activeHolds.length > 0 && (
                  <div>
                    <p className="font-semibold mb-3 flex items-center gap-2">
                      <Lock className="h-4 w-4 text-amber-600" />
                      Active Holds ({activeHolds.length})
                    </p>
                    <div className="space-y-2">
                      {activeHolds.map((hold, i) => (
                        <div key={i} className="flex items-center justify-between p-3 border rounded-lg bg-amber-50 border-amber-200">
                          <div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-300">
                                {holdTypeLabels[hold.hold_type] || hold.hold_type}
                              </Badge>
                              <span className="font-bold tabular-nums">KES {hold.amount?.toLocaleString()}</span>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">{hold.reason}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(hold.created_at).toLocaleString()}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setSelectedHold(hold); setReleaseHoldOpen(true); }}
                            data-testid={`manage-hold-${i}`}
                          >
                            Manage
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Release Hold Dialog */}
                <Dialog open={releaseHoldOpen} onOpenChange={setReleaseHoldOpen}>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Manage Hold</DialogTitle>
                      <DialogDescription>Choose what to do with this hold</DialogDescription>
                    </DialogHeader>
                    {selectedHold && (
                      <div className="space-y-4 py-4">
                        <div className="p-4 bg-muted rounded-lg">
                          <p className="font-semibold">Hold Details</p>
                          <p className="text-sm text-muted-foreground mt-1">
                            Type: {holdTypeLabels[selectedHold.hold_type] || selectedHold.hold_type}
                          </p>
                          <p className="text-sm text-muted-foreground">Amount: KES {selectedHold.amount?.toLocaleString()}</p>
                          <p className="text-sm text-muted-foreground">Reason: {selectedHold.reason}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <Button
                            variant="outline"
                            className="border-green-500 text-green-600 hover:bg-green-50"
                            onClick={() => handleReleaseHold('release')}
                            data-testid="release-hold-btn"
                          >
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Release (Return to Available)
                          </Button>
                          <Button
                            variant="outline"
                            className="border-red-500 text-red-600 hover:bg-red-50"
                            onClick={() => handleReleaseHold('deduct')}
                            data-testid="deduct-hold-btn"
                          >
                            <Minus className="h-4 w-4 mr-2" />
                            Deduct (Remove from Balance)
                          </Button>
                        </div>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>

                <Separator />

                {/* Recent Transactions */}
                <div>
                  <p className="font-semibold mb-3">Recent Transactions</p>
                  {userWallet?.recent_transactions?.length > 0 ? (
                    <div className="space-y-2">
                      {userWallet.recent_transactions.map((txn, i) => (
                        <div key={i} className="flex items-center justify-between py-2 border-b text-sm">
                          <div>
                            <p className="font-medium">{txn.description}</p>
                            <p className="text-xs text-muted-foreground">{new Date(txn.created_at).toLocaleString()}</p>
                          </div>
                          <div className="text-right">
                            <p className={`font-semibold tabular-nums ${
                              txn.type.includes("credit") || txn.type.includes("deposit") || txn.type.includes("disbursement") || txn.type.includes("interest") || txn.type.includes("refund") || txn.type === "hold_released" || txn.type === "mmf_interest" || txn.type === "lock_savings_interest"
                                ? "text-green-600" 
                                : txn.type === "hold" 
                                  ? "text-amber-600"
                                  : "text-red-600"
                            }`}>
                              {txn.type === "hold" ? "⏸ " : (txn.type.includes("credit") || txn.type.includes("deposit") || txn.type.includes("disbursement") || txn.type.includes("interest") || txn.type.includes("refund") || txn.type === "mmf_interest" || txn.type === "lock_savings_interest" ? "+" : "-")}
                              KES {txn.amount?.toLocaleString()}
                            </p>
                            {txn.available_after !== undefined && (
                              <p className="text-xs text-muted-foreground">
                                Avail: KES {txn.available_after?.toLocaleString()}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-center py-4">No transactions</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-12">Select a user to view wallet details</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// ================== ADMIN PAYBILL CONFIG PAGE ==================

const AdminPaybillPage = () => {
  const { adminToken } = useAuth();
  const [paybill, setPaybill] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPaybill = async () => {
      try {
        const res = await apiCall("GET", "/admin/paybill", null, adminToken);
        setPaybill(res.paybill_number);
      } catch (err) {
        toast.error("Failed to load paybill config");
      } finally {
        setLoading(false);
      }
    };
    fetchPaybill();
  }, [adminToken]);

  const handleUpdate = async () => {
    try {
      await apiCall("PUT", "/admin/paybill", { paybill_number: paybill }, adminToken);
      toast.success("Paybill number updated!");
    } catch (err) {
      toast.error("Failed to update paybill");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="admin-paybill-page">
      <h2 className="font-heading text-3xl font-bold">MPESA Paybill Configuration</h2>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Paybill Number</CardTitle>
          <CardDescription>Update the MPESA Paybill number for deposits</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Current Paybill Number</Label>
            <Input
              value={paybill}
              onChange={(e) => setPaybill(e.target.value)}
              placeholder="e.g., 4114517"
              data-testid="paybill-input"
            />
          </div>
          <Button onClick={handleUpdate} data-testid="update-paybill-btn">
            Update Paybill Number
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

// ================== ADMIN CONTENT MANAGEMENT PAGE ==================

const AdminContentPage = () => {
  const { adminToken, admin } = useAuth();
  const [activeTab, setActiveTab] = useState("faqs");
  const [loading, setLoading] = useState(true);
  
  // FAQs state
  const [faqs, setFaqs] = useState([]);
  const [faqDialogOpen, setFaqDialogOpen] = useState(false);
  const [editingFaq, setEditingFaq] = useState(null);
  const [faqForm, setFaqForm] = useState({ question: "", answer: "", order: 0, status: "active" });
  
  // Terms state
  const [terms, setTerms] = useState([]);
  const [termsDialogOpen, setTermsDialogOpen] = useState(false);
  const [termsForm, setTermsForm] = useState({ version: "", content: "" });
  
  // Privacy state
  const [privacyPolicies, setPrivacyPolicies] = useState([]);
  const [privacyDialogOpen, setPrivacyDialogOpen] = useState(false);
  const [privacyForm, setPrivacyForm] = useState({ version: "", content: "" });
  
  // Audit logs state
  const [auditLogs, setAuditLogs] = useState([]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [faqsRes, termsRes, privacyRes, logsRes] = await Promise.all([
        apiCall("GET", "/admin/content/faqs", null, adminToken),
        apiCall("GET", "/admin/content/terms", null, adminToken),
        apiCall("GET", "/admin/content/privacy", null, adminToken),
        apiCall("GET", "/admin/content/audit-logs?limit=50", null, adminToken)
      ]);
      setFaqs(faqsRes.faqs || []);
      setTerms(termsRes.terms || []);
      setPrivacyPolicies(privacyRes.policies || []);
      setAuditLogs(logsRes.logs || []);
    } catch (err) {
      toast.error("Failed to load content data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [adminToken]);

  // FAQ handlers
  const handleSaveFaq = async () => {
    try {
      if (editingFaq) {
        await apiCall("PUT", `/admin/content/faqs/${editingFaq.id}`, faqForm, adminToken);
        toast.success("FAQ updated");
      } else {
        await apiCall("POST", "/admin/content/faqs", faqForm, adminToken);
        toast.success("FAQ created");
      }
      setFaqDialogOpen(false);
      setEditingFaq(null);
      setFaqForm({ question: "", answer: "", order: 0, status: "active" });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save FAQ");
    }
  };

  const handleDeleteFaq = async (faqId) => {
    if (!window.confirm("Delete this FAQ?")) return;
    try {
      await apiCall("DELETE", `/admin/content/faqs/${faqId}`, null, adminToken);
      toast.success("FAQ deleted");
      fetchData();
    } catch (err) {
      toast.error("Failed to delete FAQ");
    }
  };

  const handleToggleFaq = async (faqId) => {
    try {
      await apiCall("PUT", `/admin/content/faqs/${faqId}/toggle`, null, adminToken);
      toast.success("FAQ status updated");
      fetchData();
    } catch (err) {
      toast.error("Failed to toggle FAQ");
    }
  };

  // Terms handlers
  const handleSaveTerms = async () => {
    try {
      await apiCall("POST", "/admin/content/terms", termsForm, adminToken);
      toast.success("Terms & Conditions created");
      setTermsDialogOpen(false);
      setTermsForm({ version: "", content: "" });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save terms");
    }
  };

  const handleActivateTerms = async (termsId) => {
    try {
      await apiCall("PUT", `/admin/content/terms/${termsId}/activate`, null, adminToken);
      toast.success("Terms activated");
      fetchData();
    } catch (err) {
      toast.error("Failed to activate terms");
    }
  };

  // Privacy handlers
  const handleSavePrivacy = async () => {
    try {
      await apiCall("POST", "/admin/content/privacy", privacyForm, adminToken);
      toast.success("Privacy Policy created");
      setPrivacyDialogOpen(false);
      setPrivacyForm({ version: "", content: "" });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to save privacy policy");
    }
  };

  const handleActivatePrivacy = async (privacyId) => {
    try {
      await apiCall("PUT", `/admin/content/privacy/${privacyId}/activate`, null, adminToken);
      toast.success("Privacy Policy activated");
      fetchData();
    } catch (err) {
      toast.error("Failed to activate privacy policy");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="admin-content-page">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-3xl font-bold">Content Management</h2>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="faqs">FAQs</TabsTrigger>
          <TabsTrigger value="terms">Terms & Conditions</TabsTrigger>
          <TabsTrigger value="privacy">Privacy Policy</TabsTrigger>
          <TabsTrigger value="logs">Audit Logs</TabsTrigger>
        </TabsList>

        {/* FAQs Tab */}
        <TabsContent value="faqs" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-muted-foreground">Manage frequently asked questions</p>
            <Dialog open={faqDialogOpen} onOpenChange={setFaqDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => { setEditingFaq(null); setFaqForm({ question: "", answer: "", order: 0, status: "active" }); }}>
                  <Plus className="h-4 w-4 mr-2" /> Add FAQ
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>{editingFaq ? "Edit FAQ" : "Create FAQ"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Question</Label>
                    <Input
                      placeholder="Enter question"
                      value={faqForm.question}
                      onChange={(e) => setFaqForm({ ...faqForm, question: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Answer</Label>
                    <Textarea
                      placeholder="Enter answer"
                      rows={4}
                      value={faqForm.answer}
                      onChange={(e) => setFaqForm({ ...faqForm, answer: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Display Order</Label>
                      <Input
                        type="number"
                        value={faqForm.order}
                        onChange={(e) => setFaqForm({ ...faqForm, order: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select value={faqForm.status} onValueChange={(v) => setFaqForm({ ...faqForm, status: v })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleSaveFaq} disabled={!faqForm.question || !faqForm.answer}>
                    {editingFaq ? "Update" : "Create"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {faqs.length > 0 ? (
            <div className="grid gap-3">
              {faqs.map((faq) => (
                <Card key={faq.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold">{faq.question}</h4>
                          <Badge variant={faq.status === "active" ? "default" : "secondary"}>
                            {faq.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">Order: {faq.order}</span>
                        </div>
                        <p className="text-sm text-muted-foreground">{faq.answer}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleFaq(faq.id)}
                        >
                          {faq.status === "active" ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingFaq(faq);
                            setFaqForm({ question: faq.question, answer: faq.answer, order: faq.order, status: faq.status });
                            setFaqDialogOpen(true);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteFaq(faq.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No FAQs created yet</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Terms Tab */}
        <TabsContent value="terms" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-muted-foreground">Manage Terms & Conditions versions</p>
            <Dialog open={termsDialogOpen} onOpenChange={setTermsDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" /> New Version
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create Terms & Conditions</DialogTitle>
                  <DialogDescription>Create a new version of Terms & Conditions. It will be inactive until activated.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Version</Label>
                    <Input
                      placeholder="e.g., 1.0, 2.0"
                      value={termsForm.version}
                      onChange={(e) => setTermsForm({ ...termsForm, version: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Content</Label>
                    <Textarea
                      placeholder="Enter the full terms and conditions text..."
                      rows={15}
                      value={termsForm.content}
                      onChange={(e) => setTermsForm({ ...termsForm, content: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleSaveTerms} disabled={!termsForm.version || !termsForm.content}>
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {terms.length > 0 ? (
            <div className="grid gap-3">
              {terms.map((term) => (
                <Card key={term.id} className={term.is_active ? "border-green-500 bg-green-50" : ""}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-semibold">Version {term.version}</h4>
                          {term.is_active && <Badge className="bg-green-500">Active</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          Created: {new Date(term.created_at).toLocaleString()}
                          {term.activated_at && ` • Activated: ${new Date(term.activated_at).toLocaleString()}`}
                        </p>
                        <p className="text-sm line-clamp-2">{term.content}</p>
                      </div>
                      {!term.is_active && (
                        <Button variant="outline" size="sm" onClick={() => handleActivateTerms(term.id)}>
                          Activate
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No Terms & Conditions created yet</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Privacy Tab */}
        <TabsContent value="privacy" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-muted-foreground">Manage Privacy Policy versions</p>
            <Dialog open={privacyDialogOpen} onOpenChange={setPrivacyDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" /> New Version
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create Privacy Policy</DialogTitle>
                  <DialogDescription>Create a new version of Privacy Policy. It will be inactive until activated.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Version</Label>
                    <Input
                      placeholder="e.g., 1.0, 2.0"
                      value={privacyForm.version}
                      onChange={(e) => setPrivacyForm({ ...privacyForm, version: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Content</Label>
                    <Textarea
                      placeholder="Enter the full privacy policy text..."
                      rows={15}
                      value={privacyForm.content}
                      onChange={(e) => setPrivacyForm({ ...privacyForm, content: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleSavePrivacy} disabled={!privacyForm.version || !privacyForm.content}>
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {privacyPolicies.length > 0 ? (
            <div className="grid gap-3">
              {privacyPolicies.map((policy) => (
                <Card key={policy.id} className={policy.is_active ? "border-green-500 bg-green-50" : ""}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-semibold">Version {policy.version}</h4>
                          {policy.is_active && <Badge className="bg-green-500">Active</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          Created: {new Date(policy.created_at).toLocaleString()}
                          {policy.activated_at && ` • Activated: ${new Date(policy.activated_at).toLocaleString()}`}
                        </p>
                        <p className="text-sm line-clamp-2">{policy.content}</p>
                      </div>
                      {!policy.is_active && (
                        <Button variant="outline" size="sm" onClick={() => handleActivatePrivacy(policy.id)}>
                          Activate
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No Privacy Policies created yet</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Audit Logs Tab */}
        <TabsContent value="logs" className="space-y-4">
          <p className="text-muted-foreground">Content management audit trail</p>
          
          {auditLogs.length > 0 ? (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-slate-50">
                        <th className="px-4 py-3 text-left text-sm font-medium">Timestamp</th>
                        <th className="px-4 py-3 text-left text-sm font-medium">Type</th>
                        <th className="px-4 py-3 text-left text-sm font-medium">Action</th>
                        <th className="px-4 py-3 text-left text-sm font-medium">Admin</th>
                        <th className="px-4 py-3 text-left text-sm font-medium">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map((log, i) => (
                        <tr key={log.id || i} className="border-b hover:bg-slate-50">
                          <td className="px-4 py-3 text-sm">{new Date(log.timestamp).toLocaleString()}</td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="capitalize">{log.content_type}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge 
                              className={
                                log.action === "create" ? "bg-green-500" :
                                log.action === "delete" ? "bg-red-500" :
                                log.action === "activate" ? "bg-blue-500" :
                                "bg-amber-500"
                              }
                            >
                              {log.action}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-sm">{log.admin_name || log.admin_email || "Unknown"}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {log.new_content?.question && <span>Q: {log.new_content.question.substring(0, 30)}...</span>}
                            {log.new_content?.version && <span>Version: {log.new_content.version}</span>}
                            {log.new_content?.status && <span>Status: {log.new_content.status}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8 text-center">
                <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No audit logs yet</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

// ================== ADMIN VACANCIES PAGE ==================

const AdminVacanciesPage = () => {
  const { adminToken } = useAuth();
  const [vacancies, setVacancies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingVacancy, setEditingVacancy] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    department: "",
    location: "",
    employment_type: "full_time",
    description: "",
    requirements: "",
    benefits: "",
    salary_range: "",
    application_deadline: "",
    application_email: "",
    application_instructions: ""
  });

  const fetchVacancies = async () => {
    try {
      const res = await apiCall("GET", "/admin/vacancies", null, adminToken);
      setVacancies(res.vacancies || []);
    } catch (err) {
      toast.error("Failed to load vacancies");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVacancies();
  }, [adminToken]);

  const resetForm = () => {
    setFormData({
      title: "",
      department: "",
      location: "",
      employment_type: "full_time",
      description: "",
      requirements: "",
      benefits: "",
      salary_range: "",
      application_deadline: "",
      application_email: "",
      application_instructions: ""
    });
  };

  const handleCreate = async () => {
    if (!formData.title || !formData.department || !formData.location || !formData.description || !formData.requirements) {
      toast.error("Please fill in all required fields");
      return;
    }
    try {
      await apiCall("POST", "/admin/vacancies", formData, adminToken);
      toast.success("Vacancy created successfully");
      setCreateOpen(false);
      resetForm();
      fetchVacancies();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create vacancy");
    }
  };

  const handleUpdate = async () => {
    if (!editingVacancy) return;
    try {
      await apiCall("PUT", `/admin/vacancies/${editingVacancy.id}`, formData, adminToken);
      toast.success("Vacancy updated");
      setEditingVacancy(null);
      resetForm();
      fetchVacancies();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to update vacancy");
    }
  };

  const handleStatusChange = async (vacancyId, newStatus) => {
    try {
      await apiCall("PUT", `/admin/vacancies/${vacancyId}`, { status: newStatus }, adminToken);
      toast.success(`Vacancy ${newStatus === "active" ? "activated" : "closed"}`);
      fetchVacancies();
    } catch (err) {
      toast.error("Failed to update status");
    }
  };

  const handleDelete = async (vacancyId) => {
    if (!window.confirm("Are you sure you want to delete this vacancy?")) return;
    try {
      await apiCall("DELETE", `/admin/vacancies/${vacancyId}`, null, adminToken);
      toast.success("Vacancy deleted");
      fetchVacancies();
    } catch (err) {
      toast.error("Failed to delete vacancy");
    }
  };

  const openEdit = (vacancy) => {
    setFormData({
      title: vacancy.title || "",
      department: vacancy.department || "",
      location: vacancy.location || "",
      employment_type: vacancy.employment_type || "full_time",
      description: vacancy.description || "",
      requirements: vacancy.requirements || "",
      benefits: vacancy.benefits || "",
      salary_range: vacancy.salary_range || "",
      application_deadline: vacancy.application_deadline || "",
      application_email: vacancy.application_email || "",
      application_instructions: vacancy.application_instructions || ""
    });
    setEditingVacancy(vacancy);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const VacancyForm = ({ isEdit = false }) => (
    <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Job Title *</Label>
          <Input
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="e.g., Software Engineer"
            data-testid="vacancy-title-input"
          />
        </div>
        <div className="space-y-2">
          <Label>Department *</Label>
          <Input
            value={formData.department}
            onChange={(e) => setFormData({ ...formData, department: e.target.value })}
            placeholder="e.g., Engineering"
            data-testid="vacancy-department-input"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Location *</Label>
          <Input
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            placeholder="e.g., Nairobi, Kenya"
            data-testid="vacancy-location-input"
          />
        </div>
        <div className="space-y-2">
          <Label>Employment Type *</Label>
          <Select value={formData.employment_type} onValueChange={(v) => setFormData({ ...formData, employment_type: v })}>
            <SelectTrigger data-testid="vacancy-type-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="full_time">Full Time</SelectItem>
              <SelectItem value="part_time">Part Time</SelectItem>
              <SelectItem value="contract">Contract</SelectItem>
              <SelectItem value="internship">Internship</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Salary Range (Optional)</Label>
          <Input
            value={formData.salary_range}
            onChange={(e) => setFormData({ ...formData, salary_range: e.target.value })}
            placeholder="e.g., KES 100,000 - 150,000"
          />
        </div>
        <div className="space-y-2">
          <Label>Application Deadline (Optional)</Label>
          <Input
            type="date"
            value={formData.application_deadline}
            onChange={(e) => setFormData({ ...formData, application_deadline: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Application Email</Label>
        <Input
          type="email"
          value={formData.application_email}
          onChange={(e) => setFormData({ ...formData, application_email: e.target.value })}
          placeholder="e.g., careers@dolaglobo.com"
        />
      </div>
      <div className="space-y-2">
        <Label>Job Description *</Label>
        <Textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Describe the role and responsibilities..."
          rows={4}
          data-testid="vacancy-description-input"
        />
      </div>
      <div className="space-y-2">
        <Label>Requirements *</Label>
        <Textarea
          value={formData.requirements}
          onChange={(e) => setFormData({ ...formData, requirements: e.target.value })}
          placeholder="List the required qualifications and skills..."
          rows={4}
          data-testid="vacancy-requirements-input"
        />
      </div>
      <div className="space-y-2">
        <Label>Benefits (Optional)</Label>
        <Textarea
          value={formData.benefits}
          onChange={(e) => setFormData({ ...formData, benefits: e.target.value })}
          placeholder="List the benefits offered..."
          rows={3}
        />
      </div>
      <div className="space-y-2">
        <Label>Application Instructions (Optional)</Label>
        <Textarea
          value={formData.application_instructions}
          onChange={(e) => setFormData({ ...formData, application_instructions: e.target.value })}
          placeholder="How should candidates apply?"
          rows={2}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6" data-testid="admin-vacancies-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-3xl font-bold">Job Vacancies</h2>
          <p className="text-muted-foreground">Manage career opportunities on the landing page</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="create-vacancy-btn">
              <Plus className="h-4 w-4 mr-2" />
              Add Vacancy
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Vacancy</DialogTitle>
              <DialogDescription>Add a new job opening to display on the landing page</DialogDescription>
            </DialogHeader>
            <VacancyForm />
            <DialogFooter>
              <Button variant="outline" onClick={() => { setCreateOpen(false); resetForm(); }}>Cancel</Button>
              <Button onClick={handleCreate} data-testid="save-vacancy-btn">Create Vacancy</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Vacancies</p>
            <p className="text-2xl font-bold">{vacancies.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Active</p>
            <p className="text-2xl font-bold text-green-600">{vacancies.filter(v => v.status === "active").length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Closed</p>
            <p className="text-2xl font-bold text-red-600">{vacancies.filter(v => v.status === "closed").length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Vacancies List */}
      <Card>
        <CardHeader>
          <CardTitle>All Vacancies</CardTitle>
        </CardHeader>
        <CardContent>
          {vacancies.length > 0 ? (
            <div className="space-y-4">
              {vacancies.map((vacancy, index) => (
                <div key={vacancy.id || index} className="flex items-start justify-between p-4 border rounded-lg">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">{vacancy.title}</h4>
                      <Badge variant={vacancy.status === "active" ? "default" : "secondary"}>
                        {vacancy.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {vacancy.department} • {vacancy.location} • {vacancy.employment_type?.replace("_", " ")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Created: {new Date(vacancy.created_at).toLocaleDateString()}
                      {vacancy.application_deadline && ` • Deadline: ${new Date(vacancy.application_deadline).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {vacancy.status === "active" ? (
                      <Button variant="outline" size="sm" onClick={() => handleStatusChange(vacancy.id, "closed")}>
                        Close
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => handleStatusChange(vacancy.id, "active")}>
                        Activate
                      </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => openEdit(vacancy)} data-testid={`edit-vacancy-${index}`}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" className="text-destructive" onClick={() => handleDelete(vacancy.id)} data-testid={`delete-vacancy-${index}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Briefcase className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No vacancies yet. Create your first job posting!</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingVacancy} onOpenChange={(open) => { if (!open) { setEditingVacancy(null); resetForm(); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Vacancy</DialogTitle>
            <DialogDescription>Update the job posting details</DialogDescription>
          </DialogHeader>
          <VacancyForm isEdit />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingVacancy(null); resetForm(); }}>Cancel</Button>
            <Button onClick={handleUpdate} data-testid="update-vacancy-btn">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ================== ADMIN APP VERSIONS PAGE ==================

const AdminAppVersionsPage = () => {
  const { adminToken } = useAuth();
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    version: "",
    release_notes: "",
    min_android_version: "5.0",
    file: null
  });

  const fetchVersions = async () => {
    try {
      const res = await apiCall("GET", "/admin/app/versions", null, adminToken);
      setVersions(res.versions || []);
    } catch (err) {
      toast.error("Failed to load app versions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVersions();
  }, [adminToken]);

  const handleUpload = async () => {
    if (!uploadForm.file || !uploadForm.version) {
      toast.error("Please select a file and enter version number");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", uploadForm.file);
      formData.append("version", uploadForm.version);
      formData.append("release_notes", uploadForm.release_notes);
      formData.append("min_android_version", uploadForm.min_android_version);

      await axios.post(`${API}/admin/app/upload`, formData, {
        headers: {
          "Authorization": `Bearer ${adminToken}`,
          "Content-Type": "multipart/form-data"
        },
        timeout: 300000, // 5 minute timeout for large files
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          console.log(`Upload progress: ${percent}%`);
        }
      });

      toast.success("APK uploaded successfully");
      setUploadOpen(false);
      setUploadForm({ version: "", release_notes: "", min_android_version: "5.0", file: null });
      fetchVersions();
    } catch (err) {
      console.error("APK upload error:", err);
      if (err.code === 'ECONNABORTED') {
        toast.error("Upload timed out. Please try again with a smaller file or better connection.");
      } else if (err.response?.status === 413) {
        toast.error("File too large. Maximum size is 100MB.");
      } else if (err.response?.status === 400) {
        toast.error(err.response?.data?.detail || "Invalid file format. Only APK files are allowed.");
      } else {
        toast.error(err.response?.data?.detail || "Failed to upload APK. Please try again.");
      }
    } finally {
      setUploading(false);
    }
  };

  const handleActivate = async (versionId) => {
    try {
      await apiCall("PUT", `/admin/app/versions/${versionId}/activate`, null, adminToken);
      toast.success("Version activated");
      fetchVersions();
    } catch (err) {
      toast.error("Failed to activate version");
    }
  };

  const handleDelete = async (versionId) => {
    if (!window.confirm("Are you sure you want to delete this version?")) return;
    try {
      await apiCall("DELETE", `/admin/app/versions/${versionId}`, null, adminToken);
      toast.success("Version deleted");
      fetchVersions();
    } catch (err) {
      toast.error("Failed to delete version");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="admin-app-versions-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-3xl font-bold">App Versions</h2>
          <p className="text-muted-foreground">Manage APK downloads for the landing page</p>
        </div>
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogTrigger asChild>
            <Button data-testid="upload-apk-btn">
              <Upload className="h-4 w-4 mr-2" />
              Upload APK
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload New APK</DialogTitle>
              <DialogDescription>Upload a new Android app version</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>APK File *</Label>
                <Input
                  type="file"
                  accept=".apk"
                  onChange={(e) => setUploadForm({ ...uploadForm, file: e.target.files[0] })}
                  data-testid="apk-file-input"
                />
                {uploadForm.file && (
                  <p className="text-sm text-muted-foreground">
                    Selected: {uploadForm.file.name} ({(uploadForm.file.size / (1024 * 1024)).toFixed(2)} MB)
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Version Number *</Label>
                <Input
                  value={uploadForm.version}
                  onChange={(e) => setUploadForm({ ...uploadForm, version: e.target.value })}
                  placeholder="e.g., 1.0.0"
                  data-testid="apk-version-input"
                />
              </div>
              <div className="space-y-2">
                <Label>Minimum Android Version</Label>
                <Input
                  value={uploadForm.min_android_version}
                  onChange={(e) => setUploadForm({ ...uploadForm, min_android_version: e.target.value })}
                  placeholder="e.g., 5.0"
                />
              </div>
              <div className="space-y-2">
                <Label>Release Notes</Label>
                <Textarea
                  value={uploadForm.release_notes}
                  onChange={(e) => setUploadForm({ ...uploadForm, release_notes: e.target.value })}
                  placeholder="What's new in this version..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
              <Button onClick={handleUpload} disabled={uploading} data-testid="submit-apk-btn">
                {uploading ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  "Upload APK"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Versions</p>
            <p className="text-2xl font-bold">{versions.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Downloads</p>
            <p className="text-2xl font-bold text-green-600">
              {versions.reduce((sum, v) => sum + (v.download_count || 0), 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Versions List */}
      <Card>
        <CardHeader>
          <CardTitle>All Versions</CardTitle>
        </CardHeader>
        <CardContent>
          {versions.length > 0 ? (
            <div className="space-y-4">
              {versions.map((version, index) => (
                <div key={version.id || index} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-5 w-5 text-muted-foreground" />
                      <h4 className="font-semibold">v{version.version}</h4>
                      {version.is_active && (
                        <Badge className="bg-green-100 text-green-700">Active</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {version.file_size} • Android {version.min_android_version || "5.0+"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Uploaded: {new Date(version.uploaded_at).toLocaleDateString()} • 
                      Downloads: {version.download_count || 0}
                    </p>
                    {version.release_notes && (
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                        {version.release_notes}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!version.is_active && (
                      <Button variant="outline" size="sm" onClick={() => handleActivate(version.id)}>
                        Activate
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        try {
                          const response = await fetch(`${API}/admin/app/download/${version.id}`, {
                            headers: { 'Authorization': `Bearer ${adminToken}` }
                          });
                          if (!response.ok) throw new Error('Download failed');
                          const blob = await response.blob();
                          const url = window.URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `dolaglobo-${version.version}.apk`;
                          document.body.appendChild(a);
                          a.click();
                          window.URL.revokeObjectURL(url);
                          document.body.removeChild(a);
                        } catch (err) {
                          toast.error('Failed to download APK');
                        }
                      }}
                      data-testid={`download-version-${index}`}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive"
                      onClick={() => handleDelete(version.id)}
                      data-testid={`delete-version-${index}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Smartphone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No APK versions uploaded yet</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// ================== ADMIN FEE RULES PAGE ==================

const AdminFeeRulesPage = () => {
  const { adminToken } = useAuth();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [testOpen, setTestOpen] = useState(false);
  const [testAmount, setTestAmount] = useState("");
  const [testType, setTestType] = useState("withdrawal");
  const [testResult, setTestResult] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    transaction_type: "withdrawal",
    fee_type: "percentage",
    percentage_rate: "",
    flat_amount: "",
    tiers: [],
    min_fee: "",
    max_fee: "",
    min_transaction_amount: "",
    max_transaction_amount: "",
    is_active: true
  });

  const fetchRules = async () => {
    try {
      const res = await apiCall("GET", "/admin/fee-rules", null, adminToken);
      setRules(res.rules || []);
    } catch (err) {
      toast.error("Failed to load fee rules");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, [adminToken]);

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      transaction_type: "withdrawal",
      fee_type: "percentage",
      percentage_rate: "",
      flat_amount: "",
      tiers: [],
      min_fee: "",
      max_fee: "",
      min_transaction_amount: "",
      max_transaction_amount: "",
      is_active: true
    });
  };

  const handleCreate = async () => {
    if (!formData.name) {
      toast.error("Please enter a rule name");
      return;
    }
    
    const payload = {
      ...formData,
      percentage_rate: formData.percentage_rate ? parseFloat(formData.percentage_rate) : null,
      flat_amount: formData.flat_amount ? parseFloat(formData.flat_amount) : null,
      min_fee: formData.min_fee ? parseFloat(formData.min_fee) : null,
      max_fee: formData.max_fee ? parseFloat(formData.max_fee) : null,
      min_transaction_amount: formData.min_transaction_amount ? parseFloat(formData.min_transaction_amount) : null,
      max_transaction_amount: formData.max_transaction_amount ? parseFloat(formData.max_transaction_amount) : null,
    };

    try {
      await apiCall("POST", "/admin/fee-rules", payload, adminToken);
      toast.success("Fee rule created successfully");
      setCreateOpen(false);
      resetForm();
      fetchRules();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create fee rule");
    }
  };

  const handleUpdate = async () => {
    if (!editingRule) return;
    
    const payload = {
      ...formData,
      percentage_rate: formData.percentage_rate ? parseFloat(formData.percentage_rate) : null,
      flat_amount: formData.flat_amount ? parseFloat(formData.flat_amount) : null,
      min_fee: formData.min_fee ? parseFloat(formData.min_fee) : null,
      max_fee: formData.max_fee ? parseFloat(formData.max_fee) : null,
      min_transaction_amount: formData.min_transaction_amount ? parseFloat(formData.min_transaction_amount) : null,
      max_transaction_amount: formData.max_transaction_amount ? parseFloat(formData.max_transaction_amount) : null,
    };

    try {
      await apiCall("PUT", `/admin/fee-rules/${editingRule.id}`, payload, adminToken);
      toast.success("Fee rule updated");
      setEditingRule(null);
      resetForm();
      fetchRules();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to update fee rule");
    }
  };

  const handleToggle = async (ruleId) => {
    try {
      const res = await apiCall("PUT", `/admin/fee-rules/${ruleId}/toggle`, null, adminToken);
      toast.success(res.message);
      fetchRules();
    } catch (err) {
      toast.error("Failed to toggle fee rule");
    }
  };

  const handleDelete = async (ruleId) => {
    if (!window.confirm("Are you sure you want to delete this fee rule?")) return;
    try {
      await apiCall("DELETE", `/admin/fee-rules/${ruleId}`, null, adminToken);
      toast.success("Fee rule deleted");
      fetchRules();
    } catch (err) {
      toast.error("Failed to delete fee rule");
    }
  };

  const handleTest = async () => {
    if (!testAmount) {
      toast.error("Please enter an amount to test");
      return;
    }
    try {
      const res = await axios.get(`${API}/fee-rules/calculate?transaction_type=${testType}&amount=${parseFloat(testAmount)}`);
      setTestResult(res.data);
    } catch (err) {
      toast.error("Failed to calculate fee");
    }
  };

  const openEdit = (rule) => {
    setFormData({
      name: rule.name || "",
      description: rule.description || "",
      transaction_type: rule.transaction_type || "withdrawal",
      fee_type: rule.fee_type || "percentage",
      percentage_rate: rule.percentage_rate?.toString() || "",
      flat_amount: rule.flat_amount?.toString() || "",
      tiers: rule.tiers || [],
      min_fee: rule.min_fee?.toString() || "",
      max_fee: rule.max_fee?.toString() || "",
      min_transaction_amount: rule.min_transaction_amount?.toString() || "",
      max_transaction_amount: rule.max_transaction_amount?.toString() || "",
      is_active: rule.is_active ?? true
    });
    setEditingRule(rule);
  };

  const transactionTypes = [
    { value: "withdrawal", label: "Withdrawal" },
    { value: "deposit", label: "Deposit" },
    { value: "transfer", label: "Transfer" },
    { value: "loan_disbursement", label: "Loan Disbursement" },
    { value: "savings_withdrawal", label: "Savings Withdrawal" },
    { value: "mmf_withdrawal", label: "MMF Withdrawal" },
    { value: "all", label: "All Transactions" }
  ];

  const feeTypes = [
    { value: "percentage", label: "Percentage (%)" },
    { value: "flat", label: "Flat Amount (KES)" },
    { value: "tiered", label: "Tiered (Amount-based)" }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const FeeRuleForm = ({ isEdit = false }) => (
    <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Rule Name *</Label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Withdrawal Fee"
            data-testid="fee-rule-name"
          />
        </div>
        <div className="space-y-2">
          <Label>Transaction Type *</Label>
          <Select value={formData.transaction_type} onValueChange={(v) => setFormData({ ...formData, transaction_type: v })}>
            <SelectTrigger data-testid="fee-transaction-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {transactionTypes.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Description</Label>
        <Input
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Optional description for this fee rule"
        />
      </div>

      <div className="space-y-2">
        <Label>Fee Type *</Label>
        <Select value={formData.fee_type} onValueChange={(v) => setFormData({ ...formData, fee_type: v })}>
          <SelectTrigger data-testid="fee-type-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {feeTypes.map(t => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {formData.fee_type === "percentage" && (
        <div className="space-y-2">
          <Label>Percentage Rate (%)</Label>
          <Input
            type="number"
            step="0.01"
            value={formData.percentage_rate}
            onChange={(e) => setFormData({ ...formData, percentage_rate: e.target.value })}
            placeholder="e.g., 1.5 for 1.5%"
            data-testid="fee-percentage-rate"
          />
        </div>
      )}

      {formData.fee_type === "flat" && (
        <div className="space-y-2">
          <Label>Flat Amount (KES)</Label>
          <Input
            type="number"
            value={formData.flat_amount}
            onChange={(e) => setFormData({ ...formData, flat_amount: e.target.value })}
            placeholder="e.g., 100"
            data-testid="fee-flat-amount"
          />
        </div>
      )}

      {formData.fee_type === "tiered" && (
        <div className="space-y-2 p-3 bg-muted rounded-lg">
          <Label>Tiered Fees</Label>
          <p className="text-sm text-muted-foreground">Configure tiers in JSON format. Coming soon: Visual tier editor.</p>
          <Textarea
            value={JSON.stringify(formData.tiers, null, 2)}
            onChange={(e) => {
              try {
                setFormData({ ...formData, tiers: JSON.parse(e.target.value) });
              } catch {}
            }}
            placeholder='[{"min": 0, "max": 1000, "fee": 50}, {"min": 1001, "max": 5000, "fee": 100}]'
            rows={4}
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Min Fee (KES)</Label>
          <Input
            type="number"
            value={formData.min_fee}
            onChange={(e) => setFormData({ ...formData, min_fee: e.target.value })}
            placeholder="Minimum fee amount"
          />
        </div>
        <div className="space-y-2">
          <Label>Max Fee (KES)</Label>
          <Input
            type="number"
            value={formData.max_fee}
            onChange={(e) => setFormData({ ...formData, max_fee: e.target.value })}
            placeholder="Maximum fee cap"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Min Transaction Amount</Label>
          <Input
            type="number"
            value={formData.min_transaction_amount}
            onChange={(e) => setFormData({ ...formData, min_transaction_amount: e.target.value })}
            placeholder="Only apply if amount ≥ this"
          />
        </div>
        <div className="space-y-2">
          <Label>Max Transaction Amount</Label>
          <Input
            type="number"
            value={formData.max_transaction_amount}
            onChange={(e) => setFormData({ ...formData, max_transaction_amount: e.target.value })}
            placeholder="Only apply if amount ≤ this"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="is_active"
          checked={formData.is_active}
          onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
          className="rounded"
        />
        <Label htmlFor="is_active">Active (rule will be applied to transactions)</Label>
      </div>
    </div>
  );

  return (
    <div className="space-y-6" data-testid="admin-fee-rules-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-3xl font-bold">Fee Rules</h2>
          <p className="text-muted-foreground">Configure automatic fee calculations for transactions</p>
        </div>
        <div className="flex gap-3">
          <Dialog open={testOpen} onOpenChange={setTestOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="test-fee-btn">
                <Zap className="h-4 w-4 mr-2" />
                Test Calculator
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Fee Calculator Test</DialogTitle>
                <DialogDescription>Test how fees will be calculated for a transaction</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Transaction Type</Label>
                    <Select value={testType} onValueChange={setTestType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {transactionTypes.map(t => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Amount (KES)</Label>
                    <Input
                      type="number"
                      value={testAmount}
                      onChange={(e) => setTestAmount(e.target.value)}
                      placeholder="e.g., 5000"
                      data-testid="test-amount"
                    />
                  </div>
                </div>
                <Button onClick={handleTest} className="w-full" data-testid="calculate-fee-btn">
                  Calculate Fee
                </Button>
                
                {testResult && (
                  <div className="p-4 bg-muted rounded-lg space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Gross Amount</p>
                        <p className="font-bold text-lg">KES {testResult.gross_amount?.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Total Fee</p>
                        <p className="font-bold text-lg text-red-600">- KES {testResult.total_fee?.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="pt-3 border-t">
                      <p className="text-muted-foreground text-sm">Net Amount (User Receives)</p>
                      <p className="font-bold text-2xl text-green-600">KES {testResult.net_amount?.toLocaleString()}</p>
                    </div>
                    {testResult.fee_breakdown?.length > 0 && (
                      <div className="pt-3 border-t">
                        <p className="text-sm font-medium mb-2">Fee Breakdown:</p>
                        {testResult.fee_breakdown.map((f, i) => (
                          <div key={i} className="flex justify-between text-sm">
                            <span>{f.rule_name}</span>
                            <span className="font-medium">KES {f.fee_amount?.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="create-fee-rule-btn">
                <Plus className="h-4 w-4 mr-2" />
                Add Fee Rule
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create Fee Rule</DialogTitle>
                <DialogDescription>Define a new automatic fee calculation rule</DialogDescription>
              </DialogHeader>
              <FeeRuleForm />
              <DialogFooter>
                <Button variant="outline" onClick={() => { setCreateOpen(false); resetForm(); }}>Cancel</Button>
                <Button onClick={handleCreate} data-testid="save-fee-rule-btn">Create Rule</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Rules</p>
            <p className="text-2xl font-bold">{rules.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Active Rules</p>
            <p className="text-2xl font-bold text-green-600">{rules.filter(r => r.is_active).length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Percentage Rules</p>
            <p className="text-2xl font-bold text-blue-600">{rules.filter(r => r.fee_type === "percentage").length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Flat Fee Rules</p>
            <p className="text-2xl font-bold text-amber-600">{rules.filter(r => r.fee_type === "flat").length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Rules List */}
      <Card>
        <CardHeader>
          <CardTitle>All Fee Rules</CardTitle>
        </CardHeader>
        <CardContent>
          {rules.length > 0 ? (
            <div className="space-y-4">
              {rules.map((rule, index) => (
                <div key={rule.id || index} className={`flex items-start justify-between p-4 border rounded-lg ${!rule.is_active ? 'opacity-60 bg-muted' : ''}`}>
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold">{rule.name}</h4>
                      <Badge variant={rule.is_active ? "default" : "secondary"}>
                        {rule.is_active ? "Active" : "Inactive"}
                      </Badge>
                      <Badge variant="outline">
                        {transactionTypes.find(t => t.value === rule.transaction_type)?.label || rule.transaction_type}
                      </Badge>
                      <Badge variant="outline" className={
                        rule.fee_type === "percentage" ? "bg-blue-50 text-blue-700" :
                        rule.fee_type === "flat" ? "bg-amber-50 text-amber-700" :
                        "bg-purple-50 text-purple-700"
                      }>
                        {rule.fee_type === "percentage" ? `${rule.percentage_rate}%` :
                         rule.fee_type === "flat" ? `KES ${rule.flat_amount}` :
                         "Tiered"}
                      </Badge>
                    </div>
                    {rule.description && (
                      <p className="text-sm text-muted-foreground">{rule.description}</p>
                    )}
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-2">
                      {rule.min_fee && <span>Min Fee: KES {rule.min_fee}</span>}
                      {rule.max_fee && <span>Max Fee: KES {rule.max_fee}</span>}
                      {rule.min_transaction_amount && <span>Min Txn: KES {rule.min_transaction_amount}</span>}
                      {rule.max_transaction_amount && <span>Max Txn: KES {rule.max_transaction_amount}</span>}
                      <span>Applied: {rule.applied_count || 0} times</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleToggle(rule.id)}
                      data-testid={`toggle-rule-${index}`}
                    >
                      {rule.is_active ? "Deactivate" : "Activate"}
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => openEdit(rule)}
                      data-testid={`edit-rule-${index}`}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-destructive" 
                      onClick={() => handleDelete(rule.id)}
                      data-testid={`delete-rule-${index}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Percent className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No fee rules configured yet</p>
              <p className="text-sm text-muted-foreground mt-1">Create your first fee rule to start charging fees automatically</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingRule} onOpenChange={(open) => { if (!open) { setEditingRule(null); resetForm(); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Fee Rule</DialogTitle>
            <DialogDescription>Update the fee rule configuration</DialogDescription>
          </DialogHeader>
          <FeeRuleForm isEdit />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditingRule(null); resetForm(); }}>Cancel</Button>
            <Button onClick={handleUpdate} data-testid="update-fee-rule-btn">Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ================== ADMIN CONTACTS PAGE ==================

const AdminContactsPage = () => {
  const { adminToken } = useAuth();
  const [contacts, setContacts] = useState({
    phone: "",
    phone_secondary: "",
    email: "",
    email_support: "",
    email_careers: "",
    address: "",
    city: "",
    country: "",
    working_hours: "",
    facebook: "",
    twitter: "",
    instagram: "",
    linkedin: "",
    whatsapp: ""
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchContacts = async () => {
    try {
      const res = await apiCall("GET", "/admin/company/contacts", null, adminToken);
      if (res.contacts) {
        setContacts({ ...contacts, ...res.contacts });
      }
    } catch (err) {
      toast.error("Failed to load contacts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, [adminToken]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiCall("PUT", "/admin/company/contacts", contacts, adminToken);
      toast.success("Company contacts updated successfully");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to update contacts");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="admin-contacts-page">
      <div>
        <h2 className="font-heading text-3xl font-bold">Company Contacts</h2>
        <p className="text-muted-foreground">Manage contact information displayed on the landing page</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Phone & Email */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Phone & Email
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Primary Phone</Label>
              <Input
                value={contacts.phone}
                onChange={(e) => setContacts({ ...contacts, phone: e.target.value })}
                placeholder="+254 700 000 000"
                data-testid="contact-phone-input"
              />
            </div>
            <div className="space-y-2">
              <Label>Secondary Phone (Optional)</Label>
              <Input
                value={contacts.phone_secondary}
                onChange={(e) => setContacts({ ...contacts, phone_secondary: e.target.value })}
                placeholder="+254 700 000 001"
              />
            </div>
            <div className="space-y-2">
              <Label>Primary Email</Label>
              <Input
                type="email"
                value={contacts.email}
                onChange={(e) => setContacts({ ...contacts, email: e.target.value })}
                placeholder="info@dolaglobo.com"
                data-testid="contact-email-input"
              />
            </div>
            <div className="space-y-2">
              <Label>Support Email</Label>
              <Input
                type="email"
                value={contacts.email_support}
                onChange={(e) => setContacts({ ...contacts, email_support: e.target.value })}
                placeholder="support@dolaglobo.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Careers Email</Label>
              <Input
                type="email"
                value={contacts.email_careers}
                onChange={(e) => setContacts({ ...contacts, email_careers: e.target.value })}
                placeholder="careers@dolaglobo.com"
                data-testid="contact-careers-email-input"
              />
            </div>
          </CardContent>
        </Card>

        {/* Address & Hours */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Address & Hours
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Street Address</Label>
              <Input
                value={contacts.address}
                onChange={(e) => setContacts({ ...contacts, address: e.target.value })}
                placeholder="123 Finance Street"
                data-testid="contact-address-input"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>City</Label>
                <Input
                  value={contacts.city}
                  onChange={(e) => setContacts({ ...contacts, city: e.target.value })}
                  placeholder="Nairobi"
                />
              </div>
              <div className="space-y-2">
                <Label>Country</Label>
                <Input
                  value={contacts.country}
                  onChange={(e) => setContacts({ ...contacts, country: e.target.value })}
                  placeholder="Kenya"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Working Hours</Label>
              <Textarea
                value={contacts.working_hours}
                onChange={(e) => setContacts({ ...contacts, working_hours: e.target.value })}
                placeholder="Mon-Fri: 8AM - 6PM&#10;Sat: 9AM - 1PM"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Social Media */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Social Media Links
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>WhatsApp Number</Label>
                <Input
                  value={contacts.whatsapp}
                  onChange={(e) => setContacts({ ...contacts, whatsapp: e.target.value })}
                  placeholder="+254700000000"
                />
              </div>
              <div className="space-y-2">
                <Label>Facebook URL</Label>
                <Input
                  value={contacts.facebook}
                  onChange={(e) => setContacts({ ...contacts, facebook: e.target.value })}
                  placeholder="https://facebook.com/dolaglobo"
                />
              </div>
              <div className="space-y-2">
                <Label>Twitter/X URL</Label>
                <Input
                  value={contacts.twitter}
                  onChange={(e) => setContacts({ ...contacts, twitter: e.target.value })}
                  placeholder="https://twitter.com/dolaglobo"
                />
              </div>
              <div className="space-y-2">
                <Label>Instagram URL</Label>
                <Input
                  value={contacts.instagram}
                  onChange={(e) => setContacts({ ...contacts, instagram: e.target.value })}
                  placeholder="https://instagram.com/dolaglobo"
                />
              </div>
              <div className="space-y-2">
                <Label>LinkedIn URL</Label>
                <Input
                  value={contacts.linkedin}
                  onChange={(e) => setContacts({ ...contacts, linkedin: e.target.value })}
                  placeholder="https://linkedin.com/company/dolaglobo"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} data-testid="save-contacts-btn">
          {saving ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Changes"
          )}
        </Button>
      </div>
    </div>
  );
};

// ================== ADMIN SYSTEM SETTINGS PAGE ==================

const AdminSystemSettingsPage = () => {
  const { adminToken, admin } = useAuth();
  const [settings, setSettings] = useState(null);
  const [configLogs, setConfigLogs] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createAdminOpen, setCreateAdminOpen] = useState(false);
  const [newAdminData, setNewAdminData] = useState({ email: "", password: "", name: "" });

  const fetchData = async () => {
    try {
      const settingsRes = await apiCall("GET", "/admin/system-settings", null, adminToken);
      setSettings(settingsRes);
      
      const logsRes = await apiCall("GET", "/admin/config-logs?limit=20", null, adminToken);
      setConfigLogs(logsRes.logs);
      
      // Only fetch admins list if super_admin
      if (settingsRes.admin_role === "super_admin") {
        const adminsRes = await apiCall("GET", "/admin/admins", null, adminToken);
        setAdmins(adminsRes);
      }
    } catch (err) {
      if (err.response?.status !== 403) {
        toast.error("Failed to load settings");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [adminToken]);

  const handleUpdateSettings = async (updates) => {
    setSaving(true);
    try {
      await apiCall("PUT", "/admin/system-settings", updates, adminToken);
      toast.success("Settings updated successfully");
      fetchData();
    } catch (err) {
      if (err.response?.status === 403) {
        toast.error("Super Admin access required to modify settings");
      } else {
        toast.error(err.response?.data?.detail || "Failed to update settings");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateAdminRole = async (adminId, newRole) => {
    try {
      await apiCall("PUT", `/admin/admins/${adminId}/role`, { role: newRole }, adminToken);
      toast.success("Admin role updated");
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to update role");
    }
  };

  const handleCreateAdmin = async () => {
    if (!newAdminData.email || !newAdminData.password || !newAdminData.name) {
      toast.error("All fields are required");
      return;
    }
    try {
      await apiCall("POST", "/admin/admins/create", newAdminData, adminToken);
      toast.success("Admin created successfully");
      setCreateAdminOpen(false);
      setNewAdminData({ email: "", password: "", name: "" });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to create admin");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isSuperAdmin = settings?.admin_role === "super_admin";

  return (
    <div className="space-y-6" data-testid="admin-settings-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-3xl font-bold">System Settings</h2>
          <p className="text-muted-foreground">Configure transaction modes and system behavior</p>
        </div>
        {!isSuperAdmin && (
          <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
            View Only - Super Admin required for changes
          </Badge>
        )}
      </div>

      {/* Transaction Mode Settings */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Deposit Mode */}
        <Card data-testid="deposit-mode-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              Deposit Mode
            </CardTitle>
            <CardDescription>Configure how users deposit funds</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-secondary rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Current Mode</p>
              <Badge className={settings?.settings?.deposit_mode === "stk_push" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}>
                {settings?.settings?.deposit_mode === "stk_push" ? "STK Push (Automated)" : "Manual Approval"}
              </Badge>
            </div>
            
            <div className="space-y-3">
              <div 
                className={`p-4 border rounded-lg cursor-pointer transition-colors ${settings?.settings?.deposit_mode === "manual" ? "border-primary bg-primary/5" : "hover:bg-slate-50"} ${!isSuperAdmin ? "opacity-60 cursor-not-allowed" : ""}`}
                onClick={() => isSuperAdmin && handleUpdateSettings({ deposit_mode: "manual" })}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded-full border-2 ${settings?.settings?.deposit_mode === "manual" ? "border-primary bg-primary" : "border-slate-300"}`} />
                  <span className="font-semibold">Manual Deposit Mode</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1 ml-6">
                  Users submit deposit requests → Admin approves → Wallet credited
                </p>
              </div>
              
              <div 
                className={`p-4 border rounded-lg cursor-pointer transition-colors ${settings?.settings?.deposit_mode === "stk_push" ? "border-primary bg-primary/5" : "hover:bg-slate-50"} ${!isSuperAdmin ? "opacity-60 cursor-not-allowed" : ""}`}
                onClick={() => isSuperAdmin && handleUpdateSettings({ deposit_mode: "stk_push" })}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded-full border-2 ${settings?.settings?.deposit_mode === "stk_push" ? "border-primary bg-primary" : "border-slate-300"}`} />
                  <span className="font-semibold">STK Push Mode</span>
                  <Badge variant="outline" className="text-xs">STUBBED</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1 ml-6">
                  Users initiate MPESA STK push → Auto-credited on confirmation
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Withdrawal Mode */}
        <Card data-testid="withdrawal-mode-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              Withdrawal Mode
            </CardTitle>
            <CardDescription>Configure how withdrawals are processed</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 bg-secondary rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Current Mode</p>
              <Badge className={settings?.settings?.withdrawal_mode === "automatic" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}>
                {settings?.settings?.withdrawal_mode === "automatic" ? "Automatic Processing" : "Manual Approval"}
              </Badge>
            </div>
            
            <div className="space-y-3">
              <div 
                className={`p-4 border rounded-lg cursor-pointer transition-colors ${settings?.settings?.withdrawal_mode === "manual" ? "border-primary bg-primary/5" : "hover:bg-slate-50"} ${!isSuperAdmin ? "opacity-60 cursor-not-allowed" : ""}`}
                onClick={() => isSuperAdmin && handleUpdateSettings({ withdrawal_mode: "manual" })}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded-full border-2 ${settings?.settings?.withdrawal_mode === "manual" ? "border-primary bg-primary" : "border-slate-300"}`} />
                  <span className="font-semibold">Manual Withdrawal Mode</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1 ml-6">
                  Users request → Admin approves → Admin marks paid manually
                </p>
              </div>
              
              <div 
                className={`p-4 border rounded-lg cursor-pointer transition-colors ${settings?.settings?.withdrawal_mode === "automatic" ? "border-primary bg-primary/5" : "hover:bg-slate-50"} ${!isSuperAdmin ? "opacity-60 cursor-not-allowed" : ""}`}
                onClick={() => isSuperAdmin && handleUpdateSettings({ withdrawal_mode: "automatic" })}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded-full border-2 ${settings?.settings?.withdrawal_mode === "automatic" ? "border-primary bg-primary" : "border-slate-300"}`} />
                  <span className="font-semibold">Automatic Processing</span>
                  <Badge variant="outline" className="text-xs">STUBBED</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1 ml-6">
                  System auto-processes MPESA B2C or bank transfers
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Paybill Configuration */}
      <Card data-testid="paybill-settings-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            MPESA Paybill Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Current Paybill Number</p>
              <p className="font-bold text-2xl tabular-nums">{settings?.settings?.mpesa_paybill || "4114517"}</p>
            </div>
            {isSuperAdmin && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Edit className="h-4 w-4 mr-2" />
                    Change
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Update MPESA Paybill</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Paybill Number</Label>
                      <Input
                        id="new-paybill"
                        placeholder="Enter new paybill number"
                        defaultValue={settings?.settings?.mpesa_paybill}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={() => {
                      const val = document.getElementById("new-paybill")?.value;
                      if (val) handleUpdateSettings({ mpesa_paybill: val });
                    }}>Update</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardContent>
      </Card>

      {/* KYC Email Configuration */}
      <Card data-testid="kyc-email-settings-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            KYC Email Configuration
          </CardTitle>
          <CardDescription>Email address for users to send KYC documents</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Current KYC Email</p>
              <p className="font-bold text-lg">{settings?.settings?.kyc_email || "kyc@dolaglobo.com"}</p>
            </div>
            {isSuperAdmin && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Edit className="h-4 w-4 mr-2" />
                    Change
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Update KYC Email</DialogTitle>
                    <DialogDescription>
                      This email will be shown to users as an alternative way to submit KYC documents
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>KYC Email Address</Label>
                      <Input
                        id="new-kyc-email"
                        type="email"
                        placeholder="Enter email address"
                        defaultValue={settings?.settings?.kyc_email}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={() => {
                      const val = document.getElementById("new-kyc-email")?.value;
                      if (val) handleUpdateSettings({ kyc_email: val });
                    }}>Update</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
          <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
            <p>Users can send their KYC documents to this email address as an alternative to uploading them directly in the app. This email is displayed on the user dashboard and in the KYC submission form.</p>
          </div>
        </CardContent>
      </Card>

      {/* OTP Verification Settings */}
      <Card data-testid="otp-verification-settings-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-primary" />
            OTP Verification Settings
          </CardTitle>
          <CardDescription>Control phone verification during user registration and login</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-secondary rounded-lg">
            <p className="text-sm text-muted-foreground mb-1">Current Status</p>
            <Badge className={settings?.settings?.otp_verification_enabled !== false ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}>
              {settings?.settings?.otp_verification_enabled !== false ? "OTP Enabled" : "OTP Disabled"}
            </Badge>
          </div>
          
          <div className="space-y-3">
            <div 
              className={`p-4 border rounded-lg cursor-pointer transition-colors ${settings?.settings?.otp_verification_enabled !== false ? "border-primary bg-primary/5" : "hover:bg-slate-50"} ${!isSuperAdmin ? "opacity-60 cursor-not-allowed" : ""}`}
              onClick={() => isSuperAdmin && handleUpdateSettings({ otp_verification_enabled: true })}
              data-testid="otp-enable-option"
            >
              <div className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded-full border-2 ${settings?.settings?.otp_verification_enabled !== false ? "border-primary bg-primary" : "border-slate-300"}`} />
                <span className="font-semibold">OTP Verification Enabled</span>
                <Badge variant="outline" className="text-xs text-green-600 border-green-300">Recommended</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1 ml-6">
                Users must verify their phone number via OTP during registration and login
              </p>
            </div>
            
            <div 
              className={`p-4 border rounded-lg cursor-pointer transition-colors ${settings?.settings?.otp_verification_enabled === false ? "border-primary bg-primary/5" : "hover:bg-slate-50"} ${!isSuperAdmin ? "opacity-60 cursor-not-allowed" : ""}`}
              onClick={() => isSuperAdmin && handleUpdateSettings({ otp_verification_enabled: false })}
              data-testid="otp-disable-option"
            >
              <div className="flex items-center gap-2">
                <div className={`w-4 h-4 rounded-full border-2 ${settings?.settings?.otp_verification_enabled === false ? "border-primary bg-primary" : "border-slate-300"}`} />
                <span className="font-semibold">OTP Verification Disabled</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1 ml-6">
                Users can register and login without phone verification. Phone numbers will be auto-verified.
              </p>
            </div>
          </div>
          
          {settings?.settings?.otp_verification_enabled === false && (
            <div className="p-3 bg-amber-50 rounded-lg text-sm text-amber-700 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Security Warning</p>
                <p>Disabling OTP verification reduces account security. Users won't need to verify their phone numbers, which could allow registration with invalid phone numbers.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lock Savings Early Withdrawal Penalty Settings */}
      <Card data-testid="lock-savings-penalty-settings-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PiggyBank className="h-5 w-5 text-primary" />
            Lock Savings Penalty Settings
          </CardTitle>
          <CardDescription>Configure the early withdrawal penalty for lock savings accounts</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-secondary rounded-lg">
            <p className="text-sm text-muted-foreground mb-1">Current Early Withdrawal Penalty</p>
            <p className="text-3xl font-bold text-primary" data-testid="current-penalty-display">
              {settings?.settings?.lock_savings_early_withdrawal_penalty ?? 0.5}%
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Applied when users withdraw before maturity date
            </p>
          </div>
          
          <div className="space-y-3">
            <Label htmlFor="penalty-input">Adjust Penalty Rate (%)</Label>
            <div className="flex items-center gap-3">
              <Input
                id="penalty-input"
                type="number"
                step="0.1"
                min="0"
                max="100"
                placeholder="0.5"
                defaultValue={settings?.settings?.lock_savings_early_withdrawal_penalty ?? 0.5}
                className="w-32"
                disabled={!isSuperAdmin}
                data-testid="penalty-rate-input"
                onChange={(e) => {
                  const input = e.target;
                  input.dataset.pendingValue = e.target.value;
                }}
              />
              <Button 
                disabled={!isSuperAdmin}
                data-testid="update-penalty-btn"
                onClick={async () => {
                  const input = document.getElementById('penalty-input');
                  const newValue = parseFloat(input.value);
                  if (isNaN(newValue) || newValue < 0 || newValue > 100) {
                    toast.error("Penalty must be between 0 and 100%");
                    return;
                  }
                  await handleUpdateSettings({ lock_savings_early_withdrawal_penalty: newValue });
                }}
              >
                Update Penalty
              </Button>
            </div>
            {!isSuperAdmin && (
              <p className="text-sm text-muted-foreground">Only Super Admins can modify this setting</p>
            )}
          </div>
          
          <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
            <p className="font-medium mb-1">How it works:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Penalty is applied when users withdraw their lock savings before the maturity date</li>
              <li>The penalty is calculated as a percentage of the total value (principal + accrued interest)</li>
              <li>Changes apply to new lock savings accounts only - existing accounts keep their original penalty rate</li>
            </ul>
          </div>
          
          <div className="grid grid-cols-3 gap-3 pt-2">
            <button 
              onClick={() => isSuperAdmin && handleUpdateSettings({ lock_savings_early_withdrawal_penalty: 0.5 })}
              className={`p-3 border rounded-lg text-center hover:bg-slate-50 transition-colors ${settings?.settings?.lock_savings_early_withdrawal_penalty === 0.5 ? "border-primary bg-primary/5" : ""} ${!isSuperAdmin ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
              data-testid="preset-0.5"
            >
              <p className="text-lg font-bold">0.5%</p>
              <p className="text-xs text-muted-foreground">Low</p>
            </button>
            <button 
              onClick={() => isSuperAdmin && handleUpdateSettings({ lock_savings_early_withdrawal_penalty: 2 })}
              className={`p-3 border rounded-lg text-center hover:bg-slate-50 transition-colors ${settings?.settings?.lock_savings_early_withdrawal_penalty === 2 ? "border-primary bg-primary/5" : ""} ${!isSuperAdmin ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
              data-testid="preset-2"
            >
              <p className="text-lg font-bold">2%</p>
              <p className="text-xs text-muted-foreground">Medium</p>
            </button>
            <button 
              onClick={() => isSuperAdmin && handleUpdateSettings({ lock_savings_early_withdrawal_penalty: 5 })}
              className={`p-3 border rounded-lg text-center hover:bg-slate-50 transition-colors ${settings?.settings?.lock_savings_early_withdrawal_penalty === 5 ? "border-primary bg-primary/5" : ""} ${!isSuperAdmin ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
              data-testid="preset-5"
            >
              <p className="text-lg font-bold">5%</p>
              <p className="text-xs text-muted-foreground">High</p>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Admin Management - Super Admin Only */}
      {isSuperAdmin && (
        <Card data-testid="admin-management-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Admin Management
                </CardTitle>
                <CardDescription>Manage admin users and roles</CardDescription>
              </div>
              <Dialog open={createAdminOpen} onOpenChange={setCreateAdminOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Admin
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Admin</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input
                        placeholder="Admin Name"
                        value={newAdminData.name}
                        onChange={(e) => setNewAdminData({...newAdminData, name: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        placeholder="admin@example.com"
                        value={newAdminData.email}
                        onChange={(e) => setNewAdminData({...newAdminData, email: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Password</Label>
                      <Input
                        type="password"
                        placeholder="Password"
                        value={newAdminData.password}
                        onChange={(e) => setNewAdminData({...newAdminData, password: e.target.value})}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCreateAdminOpen(false)}>Cancel</Button>
                    <Button onClick={handleCreateAdmin}>Create Admin</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {admins.map((adminUser, i) => (
                <div key={i} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-semibold">{adminUser.name}</p>
                    <p className="text-sm text-muted-foreground">{adminUser.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={adminUser.role === "super_admin" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-800"}>
                      {adminUser.role === "super_admin" ? "Super Admin" : "Admin"}
                    </Badge>
                    {adminUser.id !== admin?.id && (
                      <Select 
                        value={adminUser.role || "admin"} 
                        onValueChange={(val) => handleUpdateAdminRole(adminUser.id, val)}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="super_admin">Super Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Configuration Change History */}
      <Card data-testid="config-logs-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Configuration Change History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {configLogs.length > 0 ? (
            <ScrollArea className="h-[300px]">
              <div className="space-y-3">
                {configLogs.map((log, i) => (
                  <div key={i} className="p-3 border rounded-lg bg-slate-50">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold capitalize">{log.setting_name?.replace("_", " ")}</span>
                      <span className="text-xs text-muted-foreground">{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="bg-red-50 text-red-700">{log.old_value}</Badge>
                      <ChevronRight className="h-4 w-4" />
                      <Badge variant="outline" className="bg-green-50 text-green-700">{log.new_value}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Changed by: {log.admin_name} ({log.admin_email})</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <p className="text-center text-muted-foreground py-8">No configuration changes yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// ================== PROTECTED ROUTES ==================

const ProtectedRoute = ({ children }) => {
  const { token, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

const AdminProtectedRoute = ({ children }) => {
  const { adminToken } = useAuth();
  
  if (!adminToken) {
    return <Navigate to="/admin/login" replace />;
  }
  
  return children;
};

// ================== APP ==================

function App() {
  return (
    <HelmetProvider>
    <AuthProvider>
      <div className="App">
        <BrowserRouter>
          <Routes>
            {/* Landing Page */}
            <Route path="/" element={<LandingPage />} />
            
            {/* Public Routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-pin" element={<ForgotPinPage />} />
            <Route path="/faqs" element={<FAQsPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            
            {/* Admin Routes */}
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route path="/admin/dashboard" element={
              <AdminProtectedRoute>
                <AdminLayout><AdminDashboardPage /></AdminLayout>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/kyc" element={
              <AdminProtectedRoute>
                <AdminLayout><AdminKYCPage /></AdminLayout>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/loans" element={
              <AdminProtectedRoute>
                <AdminLayout><AdminLoansPage /></AdminLayout>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/rates" element={
              <AdminProtectedRoute>
                <AdminLayout><AdminRatesPage /></AdminLayout>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/users" element={
              <AdminProtectedRoute>
                <AdminLayout><AdminUsersPage /></AdminLayout>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/deposits" element={
              <AdminProtectedRoute>
                <AdminLayout><AdminDepositsPage /></AdminLayout>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/withdrawals" element={
              <AdminProtectedRoute>
                <AdminLayout><AdminWithdrawalsPage /></AdminLayout>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/airtime" element={
              <AdminProtectedRoute>
                <AdminLayout><AdminAirtimePage /></AdminLayout>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/statements" element={
              <AdminProtectedRoute>
                <AdminLayout><AdminStatementsPage /></AdminLayout>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/wallets" element={
              <AdminProtectedRoute>
                <AdminLayout><AdminWalletPage /></AdminLayout>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/paybill" element={
              <AdminProtectedRoute>
                <AdminLayout><AdminPaybillPage /></AdminLayout>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/vacancies" element={
              <AdminProtectedRoute>
                <AdminLayout><AdminVacanciesPage /></AdminLayout>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/contacts" element={
              <AdminProtectedRoute>
                <AdminLayout><AdminContactsPage /></AdminLayout>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/app-versions" element={
              <AdminProtectedRoute>
                <AdminLayout><AdminAppVersionsPage /></AdminLayout>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/fee-rules" element={
              <AdminProtectedRoute>
                <AdminLayout><AdminFeeRulesPage /></AdminLayout>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/content" element={
              <AdminProtectedRoute>
                <AdminLayout><AdminContentPage /></AdminLayout>
              </AdminProtectedRoute>
            } />
            <Route path="/admin/settings" element={
              <AdminProtectedRoute>
                <AdminLayout><AdminSystemSettingsPage /></AdminLayout>
              </AdminProtectedRoute>
            } />
            
            {/* Protected User Routes */}
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <UserLayout><DashboardPage /></UserLayout>
              </ProtectedRoute>
            } />
            <Route path="/wallet" element={
              <ProtectedRoute>
                <UserLayout><WalletPage /></UserLayout>
              </ProtectedRoute>
            } />
            <Route path="/deposit" element={
              <ProtectedRoute>
                <UserLayout><MPESADepositPage /></UserLayout>
              </ProtectedRoute>
            } />
            <Route path="/withdraw" element={
              <ProtectedRoute>
                <UserLayout><WithdrawalPage /></UserLayout>
              </ProtectedRoute>
            } />
            <Route path="/airtime" element={
              <ProtectedRoute>
                <UserLayout><AirtimePage /></UserLayout>
              </ProtectedRoute>
            } />
            <Route path="/statements" element={
              <ProtectedRoute>
                <UserLayout><StatementsPage /></UserLayout>
              </ProtectedRoute>
            } />
            <Route path="/savings" element={
              <ProtectedRoute>
                <UserLayout><SavingsPage /></UserLayout>
              </ProtectedRoute>
            } />
            <Route path="/mmf" element={
              <ProtectedRoute>
                <UserLayout><MMFPage /></UserLayout>
              </ProtectedRoute>
            } />
            <Route path="/loans" element={
              <ProtectedRoute>
                <UserLayout><LoansPage /></UserLayout>
              </ProtectedRoute>
            } />
            <Route path="/notifications" element={
              <ProtectedRoute>
                <UserLayout><NotificationsPage /></UserLayout>
              </ProtectedRoute>
            } />
            <Route path="/profile" element={
              <ProtectedRoute>
                <UserLayout><ProfilePage /></UserLayout>
              </ProtectedRoute>
            } />
            
            {/* Catch All */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-center" richColors />
      </div>
    </AuthProvider>
    </HelmetProvider>
  );
}

export default App;

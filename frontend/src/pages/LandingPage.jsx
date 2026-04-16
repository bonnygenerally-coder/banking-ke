import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import axios from "axios";
import {
  Wallet,
  PiggyBank,
  TrendingUp,
  CreditCard,
  Shield,
  Smartphone,
  ArrowRight,
  CheckCircle2,
  Star,
  ChevronRight,
  Menu,
  X,
  Zap,
  Users,
  Clock,
  BarChart3,
  Phone,
  Mail,
  MapPin,
  Briefcase,
  Building2,
  Calendar,
  ExternalLink,
  Send,
  Download,
  PlayCircle,
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const LandingPage = () => {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [vacancies, setVacancies] = useState([]);
  const [contacts, setContacts] = useState(null);
  const [selectedVacancy, setSelectedVacancy] = useState(null);
  const [appInfo, setAppInfo] = useState(null);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Fetch vacancies, contacts, and app info
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [vacanciesRes, contactsRes, appRes] = await Promise.all([
          axios.get(`${API}/vacancies`),
          axios.get(`${API}/company/contacts`),
          axios.get(`${API}/app/download`)
        ]);
        setVacancies(vacanciesRes.data.vacancies || []);
        setContacts(contactsRes.data.contacts || null);
        setAppInfo(appRes.data || null);
      } catch (err) {
        console.error("Failed to fetch data", err);
      }
    };
    fetchData();
  }, []);

  const products = [
    {
      icon: Wallet,
      title: "Digital Wallet",
      description: "Secure digital wallet with instant MPESA deposits and withdrawals. Manage your money on the go.",
      color: "bg-emerald-500",
      span: "col-span-full md:col-span-6 lg:col-span-8",
      featured: true,
    },
    {
      icon: PiggyBank,
      title: "Lock Savings",
      description: "Lock your savings for 3-12 months and earn up to 12% p.a. interest.",
      color: "bg-amber-500",
      span: "col-span-full md:col-span-6 lg:col-span-4",
    },
    {
      icon: CreditCard,
      title: "Quick Loans",
      description: "Access instant loans with competitive rates. Get approved in minutes.",
      color: "bg-blue-500",
      span: "col-span-full md:col-span-6 lg:col-span-4",
    },
    {
      icon: TrendingUp,
      title: "Money Market Fund",
      description: "Invest in MMF and earn daily compound interest. Withdraw anytime with no penalties.",
      color: "bg-purple-500",
      span: "col-span-full md:col-span-6 lg:col-span-8",
    },
  ];

  const features = [
    { icon: Shield, title: "Bank-Level Security", description: "Your funds are protected with advanced encryption" },
    { icon: Smartphone, title: "MPESA Integration", description: "Seamless deposits and withdrawals via MPESA" },
    { icon: Clock, title: "24/7 Access", description: "Manage your finances anytime, anywhere" },
    { icon: Zap, title: "Instant Transactions", description: "Real-time processing for all your transactions" },
    { icon: Users, title: "Community Trust", description: "Trusted by thousands of Kenyans" },
    { icon: BarChart3, title: "Growth Tools", description: "Track and grow your wealth with smart insights" },
  ];

  const steps = [
    { step: "01", title: "Create Account", description: "Sign up with your phone number in under 2 minutes" },
    { step: "02", title: "Complete KYC", description: "Verify your identity for full access to all features" },
    { step: "03", title: "Fund Wallet", description: "Deposit via MPESA to start your financial journey" },
    { step: "04", title: "Grow Wealth", description: "Save, invest, or access loans to achieve your goals" },
  ];

  const testimonials = [
    {
      name: "Mary Wanjiku",
      role: "Small Business Owner",
      content: "Dolaglobo helped me grow my business with their quick loans. The MPESA integration makes everything so easy!",
      rating: 5,
    },
    {
      name: "James Ochieng",
      role: "Freelancer",
      content: "The lock savings feature helped me save for my wedding. Earning 12% interest was amazing!",
      rating: 5,
    },
    {
      name: "Grace Muthoni",
      role: "Teacher",
      content: "I love how simple and secure the app is. My money is always safe and accessible.",
      rating: 5,
    },
  ];

  const employmentTypeLabels = {
    full_time: "Full Time",
    part_time: "Part Time",
    contract: "Contract",
    internship: "Internship"
  };

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      {/* SEO Meta Tags */}
      <Helmet>
        <title>Dolaglobo Finance - Digital Wallet & Financial Services in Kenya</title>
        <meta name="description" content="Dolaglobo Finance offers secure digital wallet services, instant M-Pesa deposits & withdrawals, personal loans up to KES 500,000, savings accounts with up to 12% interest, and airtime purchases. Join thousands of Kenyans managing their finances smarter." />
        <meta name="keywords" content="digital wallet Kenya, M-Pesa wallet, mobile money, personal loans Kenya, savings account, airtime purchase, financial services Kenya, Dolaglobo, send money Kenya, mobile banking, quick loans Kenya, money market fund Kenya" />
        <link rel="canonical" href="https://dolaglobo.co.ke/" />
        
        {/* Open Graph */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://dolaglobo.co.ke/" />
        <meta property="og:title" content="Dolaglobo Finance - Digital Wallet & Financial Services in Kenya" />
        <meta property="og:description" content="Secure digital wallet with instant M-Pesa integration. Save, invest, borrow, and grow your wealth with Dolaglobo Finance." />
        <meta property="og:image" content="https://dolaglobo.co.ke/og-image.png" />
        
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Dolaglobo Finance - Digital Wallet & Financial Services in Kenya" />
        <meta name="twitter:description" content="Secure digital wallet with instant M-Pesa integration. Save, invest, borrow, and grow your wealth." />
      </Helmet>
      
      {/* Navigation */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-[#004d40]/95 backdrop-blur-2xl shadow-lg"
            : "bg-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 md:h-20">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-[#d4af37] flex items-center justify-center">
                <Wallet className="w-6 h-6 text-white" />
              </div>
              <span className="font-heading text-xl md:text-2xl font-black text-white tracking-tight">
                Dolaglobo
              </span>
            </div>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#products" className="text-white/80 hover:text-white transition-colors font-medium">
                Products
              </a>
              <a href="#features" className="text-white/80 hover:text-white transition-colors font-medium">
                Features
              </a>
              <a href="#how-it-works" className="text-white/80 hover:text-white transition-colors font-medium">
                How It Works
              </a>
              <a href="#careers" className="text-white/80 hover:text-white transition-colors font-medium">
                Careers
              </a>
              <a href="#contact" className="text-white/80 hover:text-white transition-colors font-medium">
                Contact
              </a>
            </div>

            {/* CTA Buttons */}
            <div className="hidden md:flex items-center gap-3">
              <Button
                variant="ghost"
                className="text-white hover:bg-white/10"
                onClick={() => navigate("/login")}
                data-testid="nav-login-btn"
              >
                Login
              </Button>
              <Button
                className="bg-[#d4af37] hover:bg-[#c9a42f] text-white rounded-full px-6 shadow-[0_0_24px_rgba(212,175,55,0.4)]"
                onClick={() => navigate("/register")}
                data-testid="nav-register-btn"
              >
                Get Started
              </Button>
            </div>

            {/* Mobile Menu Toggle */}
            <button
              className="md:hidden text-white p-2"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              data-testid="mobile-menu-toggle"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-[#004d40]/98 backdrop-blur-2xl border-t border-white/10">
            <div className="px-4 py-6 space-y-4">
              <a href="#products" className="block text-white/80 hover:text-white py-2 font-medium" onClick={() => setMobileMenuOpen(false)}>
                Products
              </a>
              <a href="#features" className="block text-white/80 hover:text-white py-2 font-medium" onClick={() => setMobileMenuOpen(false)}>
                Features
              </a>
              <a href="#how-it-works" className="block text-white/80 hover:text-white py-2 font-medium" onClick={() => setMobileMenuOpen(false)}>
                How It Works
              </a>
              <a href="#careers" className="block text-white/80 hover:text-white py-2 font-medium" onClick={() => setMobileMenuOpen(false)}>
                Careers
              </a>
              <a href="#contact" className="block text-white/80 hover:text-white py-2 font-medium" onClick={() => setMobileMenuOpen(false)}>
                Contact
              </a>
              <div className="pt-4 space-y-3 border-t border-white/10">
                <Button
                  variant="outline"
                  className="w-full border-white/30 text-white hover:bg-white/10"
                  onClick={() => navigate("/login")}
                  data-testid="mobile-login-btn"
                >
                  Login
                </Button>
                <Button
                  className="w-full bg-[#d4af37] hover:bg-[#c9a42f] text-white"
                  onClick={() => navigate("/register")}
                  data-testid="mobile-register-btn"
                >
                  Get Started
                </Button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen bg-gradient-to-br from-[#004d40] via-[#00695c] to-[#004d40] overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 bg-[#d4af37] rounded-full blur-[100px]" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-[#d4af37] rounded-full blur-[120px]" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-20 md:pt-40 md:pb-32">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12 items-center">
            {/* Left Content */}
            <div className="md:col-span-7 text-center md:text-left">
              <Badge className="bg-[#d4af37]/20 text-[#f0d78c] border-[#d4af37]/30 mb-6 px-4 py-2 text-sm font-medium">
                Finance for Growth
              </Badge>
              <h1 className="font-heading text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black text-white tracking-tighter leading-[1.1] mb-6">
                Your Money,{" "}
                <span className="text-[#d4af37]">Your Future,</span>{" "}
                Your Control
              </h1>
              <p className="text-lg md:text-xl text-white/70 max-w-xl mb-8 leading-relaxed">
                Save smarter, borrow easier, and grow your wealth with Kenya's most trusted digital finance platform. 
                Seamlessly integrated with MPESA for your convenience.
              </p>

              {/* MPESA Badge */}
              <div className="flex items-center gap-3 mb-8 justify-center md:justify-start flex-wrap">
                <div className="flex items-center gap-2 bg-[#4CAF50]/20 border border-[#4CAF50]/30 rounded-full px-4 py-2">
                  <Smartphone className="w-5 h-5 text-[#4CAF50]" />
                  <span className="text-[#4CAF50] font-semibold text-sm">MPESA Integrated</span>
                </div>
                <div className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-2">
                  <Shield className="w-5 h-5 text-white/80" />
                  <span className="text-white/80 font-semibold text-sm">Bank-Level Security</span>
                </div>
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start flex-wrap">
                <Button
                  size="lg"
                  className="bg-[#d4af37] hover:bg-[#c9a42f] text-white rounded-full px-8 py-6 text-lg font-bold shadow-[0_0_30px_rgba(212,175,55,0.5)] hover:shadow-[0_0_40px_rgba(212,175,55,0.6)] transition-all"
                  onClick={() => navigate("/register")}
                  data-testid="hero-register-btn"
                >
                  Start Your Journey
                  <ArrowRight className="ml-2 w-5 h-5" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="border-2 border-white/30 text-white hover:bg-white/10 rounded-full px-8 py-6 text-lg font-bold"
                  onClick={() => navigate("/login")}
                  data-testid="hero-login-btn"
                >
                  Sign In
                </Button>
                {appInfo?.available && (
                  <Button
                    size="lg"
                    variant="outline"
                    className="border-2 border-[#4CAF50]/50 text-[#4CAF50] hover:bg-[#4CAF50]/10 rounded-full px-8 py-6 text-lg font-bold"
                    onClick={() => window.open(`${API}${appInfo.download_url}`, '_blank')}
                    data-testid="hero-download-btn"
                  >
                    <Download className="mr-2 w-5 h-5" />
                    Download App
                  </Button>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-6 mt-12 pt-8 border-t border-white/10">
                <div className="text-center md:text-left">
                  <p className="text-3xl md:text-4xl font-black text-[#d4af37] tabular-nums">10K+</p>
                  <p className="text-sm text-white/60">Active Users</p>
                </div>
                <div className="text-center md:text-left">
                  <p className="text-3xl md:text-4xl font-black text-[#d4af37] tabular-nums">12%</p>
                  <p className="text-sm text-white/60">Savings Interest</p>
                </div>
                <div className="text-center md:text-left">
                  <p className="text-3xl md:text-4xl font-black text-[#d4af37] tabular-nums">24/7</p>
                  <p className="text-sm text-white/60">Support</p>
                </div>
              </div>
            </div>

            {/* Right Visual - Floating Cards */}
            <div className="md:col-span-5 relative hidden md:block">
              <div className="relative w-full h-[500px]">
                {/* Main Card */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-44 bg-gradient-to-br from-[#002c24] to-[#004d40] rounded-2xl shadow-2xl p-6 border border-white/10 transform hover:scale-105 transition-transform">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-[#d4af37] flex items-center justify-center">
                      <Wallet className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <p className="text-white/60 text-sm">Wallet Balance</p>
                      <p className="text-white font-bold text-xl tabular-nums">KES 125,430.00</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 bg-white/10 rounded-lg p-3 text-center">
                      <p className="text-white/60 text-xs">Savings</p>
                      <p className="text-white font-semibold tabular-nums">50,000</p>
                    </div>
                    <div className="flex-1 bg-white/10 rounded-lg p-3 text-center">
                      <p className="text-white/60 text-xs">MMF</p>
                      <p className="text-white font-semibold tabular-nums">30,000</p>
                    </div>
                  </div>
                </div>

                {/* Floating Elements */}
                <div className="absolute top-10 right-0 w-48 h-28 bg-white rounded-xl shadow-xl p-4 transform rotate-6 hover:rotate-0 transition-transform">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    </div>
                    <span className="text-sm font-semibold text-green-600">Deposit Success</span>
                  </div>
                  <p className="text-gray-600 text-sm">+KES 5,000</p>
                  <p className="text-gray-400 text-xs">via MPESA</p>
                </div>

                <div className="absolute bottom-16 left-0 w-44 h-24 bg-white rounded-xl shadow-xl p-4 transform -rotate-6 hover:rotate-0 transition-transform">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-5 h-5 text-purple-500" />
                    <span className="text-sm font-semibold text-gray-700">MMF Earnings</span>
                  </div>
                  <p className="text-purple-600 font-bold tabular-nums">+KES 127.50</p>
                  <p className="text-gray-400 text-xs">This month</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Wave Divider */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 120L60 105C120 90 240 60 360 45C480 30 600 30 720 37.5C840 45 960 60 1080 67.5C1200 75 1320 75 1380 75L1440 75V120H1380C1320 120 1200 120 1080 120C960 120 840 120 720 120C600 120 480 120 360 120C240 120 120 120 60 120H0Z" fill="#FAFAF9"/>
          </svg>
        </div>
      </section>

      {/* Products Section */}
      <section id="products" className="py-20 md:py-32 bg-[#FAFAF9]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge className="bg-[#004d40]/10 text-[#004d40] border-[#004d40]/20 mb-4">Our Products</Badge>
            <h2 className="font-heading text-3xl md:text-5xl font-black text-[#0a1f1c] tracking-tighter mb-4">
              Financial Products Built for You
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              From daily transactions to long-term investments, we have everything you need to manage and grow your money.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            {products.map((product, index) => (
              <Card
                key={index}
                className={`${product.span} bg-white border border-[#004d40]/10 shadow-sm hover:shadow-[0_10px_30px_-10px_rgba(0,77,64,0.15)] hover:-translate-y-1 transition-all duration-300 overflow-hidden group`}
                data-testid={`product-card-${index}`}
              >
                <CardContent className={`p-6 md:p-8 ${product.featured ? "md:p-10" : ""}`}>
                  <div className={`w-14 h-14 ${product.color} rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                    <product.icon className="w-7 h-7 text-white" />
                  </div>
                  <h3 className={`font-heading font-bold text-[#0a1f1c] mb-3 ${product.featured ? "text-2xl md:text-3xl" : "text-xl md:text-2xl"}`}>
                    {product.title}
                  </h3>
                  <p className={`text-gray-600 leading-relaxed ${product.featured ? "text-lg" : ""}`}>
                    {product.description}
                  </p>
                  <Button
                    variant="link"
                    className="mt-4 p-0 text-[#004d40] font-semibold group-hover:text-[#d4af37] transition-colors"
                    onClick={() => navigate("/register")}
                    data-testid={`product-learn-more-${index}`}
                  >
                    Learn More <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 md:py-32 bg-[#004d40]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge className="bg-[#d4af37]/20 text-[#f0d78c] border-[#d4af37]/30 mb-4">Why Choose Us</Badge>
            <h2 className="font-heading text-3xl md:text-5xl font-black text-white tracking-tighter mb-4">
              Features That Set Us Apart
            </h2>
            <p className="text-lg text-white/70 max-w-2xl mx-auto">
              Built with security, convenience, and growth in mind. Everything you need to manage your finances.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <div
                key={index}
                className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all"
                data-testid={`feature-card-${index}`}
              >
                <div className="w-12 h-12 bg-[#d4af37]/20 rounded-xl flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-[#d4af37]" />
                </div>
                <h3 className="font-heading font-bold text-white text-lg mb-2">{feature.title}</h3>
                <p className="text-white/60">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 md:py-32 bg-[#FAFAF9]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge className="bg-[#004d40]/10 text-[#004d40] border-[#004d40]/20 mb-4">How It Works</Badge>
            <h2 className="font-heading text-3xl md:text-5xl font-black text-[#0a1f1c] tracking-tighter mb-4">
              Get Started in 4 Simple Steps
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Join thousands of Kenyans who trust Dolaglobo for their financial needs.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div key={index} className="relative" data-testid={`step-card-${index}`}>
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-12 left-full w-full h-0.5 bg-gradient-to-r from-[#004d40] to-transparent" style={{ width: "calc(100% - 2rem)" }} />
                )}
                <div className="text-center">
                  <div className="w-24 h-24 mx-auto mb-6 bg-[#004d40] rounded-full flex items-center justify-center">
                    <span className="font-heading text-3xl font-black text-[#d4af37]">{step.step}</span>
                  </div>
                  <h3 className="font-heading font-bold text-xl text-[#0a1f1c] mb-2">{step.title}</h3>
                  <p className="text-gray-600">{step.description}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-16">
            <Button
              size="lg"
              className="bg-[#004d40] hover:bg-[#002c24] text-white rounded-full px-8 py-6 text-lg font-bold"
              onClick={() => navigate("/register")}
              data-testid="how-it-works-cta"
            >
              Create Your Account
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Download App Section */}
      <section id="download" className="py-20 md:py-32 bg-gradient-to-br from-[#002c24] via-[#004d40] to-[#002c24] relative overflow-hidden">
        {/* Background decorations */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 right-10 w-64 h-64 bg-[#d4af37] rounded-full blur-[100px]" />
          <div className="absolute bottom-10 left-10 w-80 h-80 bg-[#4CAF50] rounded-full blur-[120px]" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left Content */}
            <div className="text-center lg:text-left">
              <Badge className="bg-[#4CAF50]/20 text-[#4CAF50] border-[#4CAF50]/30 mb-4">Mobile App</Badge>
              <h2 className="font-heading text-3xl md:text-5xl font-black text-white tracking-tighter mb-6">
                Download Our App
              </h2>
              <p className="text-lg text-white/70 mb-8 max-w-lg">
                Get the Dolaglobo Finance app on your Android device. Manage your wallet, savings, and loans on the go with our secure mobile application.
              </p>

              {appInfo?.available ? (
                <div className="space-y-6">
                  <div className="flex flex-wrap gap-4 justify-center lg:justify-start">
                    <Button
                      size="lg"
                      className="bg-[#4CAF50] hover:bg-[#43A047] text-white rounded-full px-8 py-6 text-lg font-bold shadow-[0_0_30px_rgba(76,175,80,0.4)] hover:shadow-[0_0_40px_rgba(76,175,80,0.5)] transition-all"
                      onClick={() => window.open(`${API}${appInfo.download_url}`, '_blank')}
                      data-testid="download-apk-btn"
                    >
                      <Download className="mr-2 w-6 h-6" />
                      Download APK
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-6 justify-center lg:justify-start text-white/60 text-sm">
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-4 h-4" />
                      <span>Android {appInfo.min_android_version || "5.0+"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Download className="w-4 h-4" />
                      <span>{appInfo.file_size || "~15 MB"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      <span>v{appInfo.version}</span>
                    </div>
                  </div>

                  {appInfo.release_notes && (
                    <div className="bg-white/5 rounded-xl p-4 border border-white/10 max-w-md">
                      <p className="text-white/60 text-sm font-medium mb-1">What's New:</p>
                      <p className="text-white/80 text-sm whitespace-pre-line">{appInfo.release_notes}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-white/5 rounded-xl p-6 border border-white/10 max-w-md mx-auto lg:mx-0">
                  <PlayCircle className="w-12 h-12 text-[#d4af37] mb-4" />
                  <h3 className="text-white font-semibold mb-2">Coming Soon!</h3>
                  <p className="text-white/60 text-sm">
                    Our mobile app is currently in development. Sign up now to be notified when it's available!
                  </p>
                  <Button
                    className="mt-4 bg-[#d4af37] hover:bg-[#c9a42f] text-white rounded-full"
                    onClick={() => navigate("/register")}
                    data-testid="notify-app-btn"
                  >
                    Get Notified
                  </Button>
                </div>
              )}
            </div>

            {/* Right - Phone Mockup */}
            <div className="relative flex justify-center lg:justify-end">
              <div className="relative w-64 h-[500px]">
                {/* Phone Frame */}
                <div className="absolute inset-0 bg-gradient-to-b from-gray-900 to-gray-800 rounded-[3rem] p-2 shadow-2xl transform rotate-3 hover:rotate-0 transition-transform duration-500">
                  <div className="w-full h-full bg-gradient-to-br from-[#004d40] to-[#002c24] rounded-[2.5rem] overflow-hidden relative">
                    {/* Status Bar */}
                    <div className="h-8 bg-black/20 flex items-center justify-between px-6 text-white text-xs">
                      <span>9:41</span>
                      <div className="flex gap-1">
                        <div className="w-4 h-2 border border-white/60 rounded-sm">
                          <div className="w-3 h-full bg-white/60 rounded-sm" />
                        </div>
                      </div>
                    </div>
                    
                    {/* App Content Mock */}
                    <div className="p-4 space-y-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-[#d4af37] flex items-center justify-center">
                          <Wallet className="w-4 h-4 text-white" />
                        </div>
                        <span className="text-white font-bold">Dolaglobo</span>
                      </div>
                      
                      <div className="bg-white/10 rounded-xl p-4">
                        <p className="text-white/60 text-xs">Total Balance</p>
                        <p className="text-white font-bold text-2xl tabular-nums">KES 125,430</p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-white/10 rounded-lg p-3 text-center">
                          <ArrowRight className="w-5 h-5 text-green-400 mx-auto mb-1 rotate-[-45deg]" />
                          <p className="text-white/60 text-xs">Deposit</p>
                        </div>
                        <div className="bg-white/10 rounded-lg p-3 text-center">
                          <ArrowRight className="w-5 h-5 text-red-400 mx-auto mb-1 rotate-[135deg]" />
                          <p className="text-white/60 text-xs">Withdraw</p>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <p className="text-white/60 text-xs">Recent Transactions</p>
                        <div className="bg-white/5 rounded-lg p-2 flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                            <ArrowRight className="w-3 h-3 text-green-400 rotate-[-45deg]" />
                          </div>
                          <div className="flex-1">
                            <p className="text-white text-xs">MPESA Deposit</p>
                            <p className="text-white/40 text-[10px]">Today, 2:30 PM</p>
                          </div>
                          <p className="text-green-400 text-xs font-medium">+5,000</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Floating notification */}
                <div className="absolute -top-4 -left-8 bg-white rounded-xl p-3 shadow-xl transform -rotate-6 hover:rotate-0 transition-transform">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-800">Download Complete</p>
                      <p className="text-[10px] text-gray-500">Install now</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="py-20 md:py-32 bg-gradient-to-br from-[#002c24] to-[#004d40]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge className="bg-[#d4af37]/20 text-[#f0d78c] border-[#d4af37]/30 mb-4">Testimonials</Badge>
            <h2 className="font-heading text-3xl md:text-5xl font-black text-white tracking-tighter mb-4">
              Loved by Thousands
            </h2>
            <p className="text-lg text-white/70 max-w-2xl mx-auto">
              See what our users have to say about their experience with Dolaglobo Finance.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((testimonial, index) => (
              <Card
                key={index}
                className="bg-white/5 backdrop-blur-sm border border-white/10"
                data-testid={`testimonial-card-${index}`}
              >
                <CardContent className="p-6">
                  <div className="flex gap-1 mb-4">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="w-5 h-5 fill-[#d4af37] text-[#d4af37]" />
                    ))}
                  </div>
                  <p className="text-white/80 mb-6 leading-relaxed">"{testimonial.content}"</p>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-[#d4af37]/20 rounded-full flex items-center justify-center">
                      <span className="text-[#d4af37] font-bold text-lg">{testimonial.name.charAt(0)}</span>
                    </div>
                    <div>
                      <p className="text-white font-semibold">{testimonial.name}</p>
                      <p className="text-white/60 text-sm">{testimonial.role}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Careers Section */}
      <section id="careers" className="py-20 md:py-32 bg-[#FAFAF9]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge className="bg-[#004d40]/10 text-[#004d40] border-[#004d40]/20 mb-4">Join Our Team</Badge>
            <h2 className="font-heading text-3xl md:text-5xl font-black text-[#0a1f1c] tracking-tighter mb-4">
              Career Opportunities
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Be part of our mission to revolutionize finance in Africa. We're looking for talented individuals to join our growing team.
            </p>
          </div>

          {vacancies.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {vacancies.map((vacancy, index) => (
                <Card
                  key={vacancy.id || index}
                  className="bg-white border border-[#004d40]/10 shadow-sm hover:shadow-[0_10px_30px_-10px_rgba(0,77,64,0.15)] hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                  onClick={() => setSelectedVacancy(vacancy)}
                  data-testid={`vacancy-card-${index}`}
                >
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="w-12 h-12 bg-[#004d40]/10 rounded-xl flex items-center justify-center">
                        <Briefcase className="w-6 h-6 text-[#004d40]" />
                      </div>
                      <Badge className="bg-[#d4af37]/20 text-[#004d40] border-[#d4af37]/30">
                        {employmentTypeLabels[vacancy.employment_type] || vacancy.employment_type}
                      </Badge>
                    </div>
                    <h3 className="font-heading font-bold text-xl text-[#0a1f1c] mb-2">{vacancy.title}</h3>
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-2 text-gray-600 text-sm">
                        <Building2 className="w-4 h-4" />
                        <span>{vacancy.department}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600 text-sm">
                        <MapPin className="w-4 h-4" />
                        <span>{vacancy.location}</span>
                      </div>
                      {vacancy.application_deadline && (
                        <div className="flex items-center gap-2 text-gray-600 text-sm">
                          <Calendar className="w-4 h-4" />
                          <span>Deadline: {new Date(vacancy.application_deadline).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                    <p className="text-gray-600 text-sm line-clamp-2 mb-4">{vacancy.description}</p>
                    <Button
                      variant="outline"
                      className="w-full border-[#004d40] text-[#004d40] hover:bg-[#004d40]/5"
                      onClick={(e) => { e.stopPropagation(); setSelectedVacancy(vacancy); }}
                      data-testid={`vacancy-view-${index}`}
                    >
                      View Details
                      <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="bg-white border border-[#004d40]/10">
              <CardContent className="py-16 text-center">
                <Briefcase className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <h3 className="font-heading font-bold text-xl text-[#0a1f1c] mb-2">No Open Positions</h3>
                <p className="text-gray-600 max-w-md mx-auto">
                  We don't have any open positions at the moment. Please check back later or send your CV to{" "}
                  <a href={`mailto:${contacts?.email_careers || "careers@dolaglobo.com"}`} className="text-[#004d40] font-semibold hover:underline">
                    {contacts?.email_careers || "careers@dolaglobo.com"}
                  </a>
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Vacancy Detail Modal */}
        {selectedVacancy && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedVacancy(null)}>
            <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="sticky top-0 bg-white border-b p-6 flex items-center justify-between">
                <div>
                  <h2 className="font-heading font-bold text-2xl text-[#0a1f1c]">{selectedVacancy.title}</h2>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                    <span className="flex items-center gap-1"><Building2 className="w-4 h-4" />{selectedVacancy.department}</span>
                    <span className="flex items-center gap-1"><MapPin className="w-4 h-4" />{selectedVacancy.location}</span>
                  </div>
                </div>
                <button onClick={() => setSelectedVacancy(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                <div className="flex flex-wrap gap-2">
                  <Badge className="bg-[#d4af37]/20 text-[#004d40] border-[#d4af37]/30">
                    {employmentTypeLabels[selectedVacancy.employment_type] || selectedVacancy.employment_type}
                  </Badge>
                  {selectedVacancy.salary_range && (
                    <Badge variant="outline" className="border-green-500 text-green-600">
                      {selectedVacancy.salary_range}
                    </Badge>
                  )}
                  {selectedVacancy.application_deadline && (
                    <Badge variant="outline" className="border-orange-500 text-orange-600">
                      Deadline: {new Date(selectedVacancy.application_deadline).toLocaleDateString()}
                    </Badge>
                  )}
                </div>

                <div>
                  <h3 className="font-heading font-bold text-lg text-[#0a1f1c] mb-2">Job Description</h3>
                  <p className="text-gray-600 whitespace-pre-line">{selectedVacancy.description}</p>
                </div>

                <div>
                  <h3 className="font-heading font-bold text-lg text-[#0a1f1c] mb-2">Requirements</h3>
                  <p className="text-gray-600 whitespace-pre-line">{selectedVacancy.requirements}</p>
                </div>

                {selectedVacancy.benefits && (
                  <div>
                    <h3 className="font-heading font-bold text-lg text-[#0a1f1c] mb-2">Benefits</h3>
                    <p className="text-gray-600 whitespace-pre-line">{selectedVacancy.benefits}</p>
                  </div>
                )}

                <div className="bg-[#004d40]/5 rounded-xl p-6">
                  <h3 className="font-heading font-bold text-lg text-[#0a1f1c] mb-3 flex items-center gap-2">
                    <Send className="w-5 h-5 text-[#004d40]" />
                    How to Apply
                  </h3>
                  {selectedVacancy.application_instructions ? (
                    <p className="text-gray-600 whitespace-pre-line mb-4">{selectedVacancy.application_instructions}</p>
                  ) : (
                    <p className="text-gray-600 mb-4">Send your CV and cover letter to the email address below:</p>
                  )}
                  {selectedVacancy.application_email && (
                    <a
                      href={`mailto:${selectedVacancy.application_email}?subject=Application for ${selectedVacancy.title}`}
                      className="inline-flex items-center gap-2 bg-[#004d40] text-white px-6 py-3 rounded-full font-semibold hover:bg-[#002c24] transition-colors"
                      data-testid="apply-vacancy-btn"
                    >
                      <Mail className="w-5 h-5" />
                      Apply via Email
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Contact Section */}
      <section id="contact" className="py-20 md:py-32 bg-[#004d40]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <Badge className="bg-[#d4af37]/20 text-[#f0d78c] border-[#d4af37]/30 mb-4">Get in Touch</Badge>
            <h2 className="font-heading text-3xl md:text-5xl font-black text-white tracking-tighter mb-4">
              Contact Us
            </h2>
            <p className="text-lg text-white/70 max-w-2xl mx-auto">
              Have questions or need support? We're here to help. Reach out to us through any of the channels below.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Phone */}
            <Card className="bg-white/5 backdrop-blur-sm border border-white/10" data-testid="contact-phone">
              <CardContent className="p-6 text-center">
                <div className="w-14 h-14 mx-auto mb-4 bg-[#d4af37]/20 rounded-full flex items-center justify-center">
                  <Phone className="w-7 h-7 text-[#d4af37]" />
                </div>
                <h3 className="font-heading font-bold text-white text-lg mb-2">Call Us</h3>
                <p className="text-white/80">{contacts?.phone || "+254 700 000 000"}</p>
                {contacts?.phone_secondary && (
                  <p className="text-white/60 text-sm mt-1">{contacts.phone_secondary}</p>
                )}
              </CardContent>
            </Card>

            {/* Email */}
            <Card className="bg-white/5 backdrop-blur-sm border border-white/10" data-testid="contact-email">
              <CardContent className="p-6 text-center">
                <div className="w-14 h-14 mx-auto mb-4 bg-[#d4af37]/20 rounded-full flex items-center justify-center">
                  <Mail className="w-7 h-7 text-[#d4af37]" />
                </div>
                <h3 className="font-heading font-bold text-white text-lg mb-2">Email Us</h3>
                <p className="text-white/80">{contacts?.email || "support@dolaglobo.com"}</p>
                {contacts?.email_support && contacts.email_support !== contacts.email && (
                  <p className="text-white/60 text-sm mt-1">{contacts.email_support}</p>
                )}
              </CardContent>
            </Card>

            {/* Address */}
            <Card className="bg-white/5 backdrop-blur-sm border border-white/10" data-testid="contact-address">
              <CardContent className="p-6 text-center">
                <div className="w-14 h-14 mx-auto mb-4 bg-[#d4af37]/20 rounded-full flex items-center justify-center">
                  <MapPin className="w-7 h-7 text-[#d4af37]" />
                </div>
                <h3 className="font-heading font-bold text-white text-lg mb-2">Visit Us</h3>
                <p className="text-white/80">{contacts?.address || "Nairobi"}</p>
                <p className="text-white/60 text-sm mt-1">
                  {contacts?.city || "Nairobi"}, {contacts?.country || "Kenya"}
                </p>
              </CardContent>
            </Card>

            {/* Working Hours */}
            <Card className="bg-white/5 backdrop-blur-sm border border-white/10" data-testid="contact-hours">
              <CardContent className="p-6 text-center">
                <div className="w-14 h-14 mx-auto mb-4 bg-[#d4af37]/20 rounded-full flex items-center justify-center">
                  <Clock className="w-7 h-7 text-[#d4af37]" />
                </div>
                <h3 className="font-heading font-bold text-white text-lg mb-2">Working Hours</h3>
                <p className="text-white/80 whitespace-pre-line">{contacts?.working_hours || "Mon-Fri: 8AM - 6PM\nSat: 9AM - 1PM"}</p>
              </CardContent>
            </Card>
          </div>

          {/* Social Media Links */}
          {(contacts?.whatsapp || contacts?.facebook || contacts?.twitter || contacts?.instagram || contacts?.linkedin) && (
            <div className="mt-12 text-center">
              <p className="text-white/70 mb-4">Follow us on social media</p>
              <div className="flex justify-center gap-4">
                {contacts?.whatsapp && (
                  <a href={`https://wa.me/${contacts.whatsapp.replace(/[^0-9]/g, '')}`} target="_blank" rel="noopener noreferrer" className="w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors" data-testid="social-whatsapp">
                    <Smartphone className="w-5 h-5 text-white" />
                  </a>
                )}
                {contacts?.facebook && (
                  <a href={contacts.facebook} target="_blank" rel="noopener noreferrer" className="w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors" data-testid="social-facebook">
                    <span className="text-white font-bold">f</span>
                  </a>
                )}
                {contacts?.twitter && (
                  <a href={contacts.twitter} target="_blank" rel="noopener noreferrer" className="w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors" data-testid="social-twitter">
                    <span className="text-white font-bold">X</span>
                  </a>
                )}
                {contacts?.instagram && (
                  <a href={contacts.instagram} target="_blank" rel="noopener noreferrer" className="w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors" data-testid="social-instagram">
                    <span className="text-white font-bold">IG</span>
                  </a>
                )}
                {contacts?.linkedin && (
                  <a href={contacts.linkedin} target="_blank" rel="noopener noreferrer" className="w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center transition-colors" data-testid="social-linkedin">
                    <span className="text-white font-bold">in</span>
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 md:py-32 bg-[#FAFAF9]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-heading text-3xl md:text-5xl font-black text-[#0a1f1c] tracking-tighter mb-6">
            Ready to Take Control of Your Finances?
          </h2>
          <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
            Join Dolaglobo today and start your journey towards financial freedom. It only takes 2 minutes to get started.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              className="bg-[#004d40] hover:bg-[#002c24] text-white rounded-full px-10 py-6 text-lg font-bold"
              onClick={() => navigate("/register")}
              data-testid="cta-register-btn"
            >
              Create Free Account
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-2 border-[#004d40] text-[#004d40] hover:bg-[#004d40]/5 rounded-full px-10 py-6 text-lg font-bold"
              onClick={() => navigate("/login")}
              data-testid="cta-login-btn"
            >
              Sign In
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#002c24] py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            {/* Brand */}
            <div className="md:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-10 h-10 rounded-xl bg-[#d4af37] flex items-center justify-center">
                  <Wallet className="w-6 h-6 text-white" />
                </div>
                <span className="font-heading text-2xl font-black text-white tracking-tight">
                  Dolaglobo
                </span>
              </div>
              <p className="text-white/60 max-w-md mb-6">
                Your trusted partner for digital finance in Kenya. Save, invest, and grow your wealth with us.
              </p>
              <div className="flex items-center gap-2 bg-[#4CAF50]/20 border border-[#4CAF50]/30 rounded-full px-4 py-2 w-fit">
                <Smartphone className="w-5 h-5 text-[#4CAF50]" />
                <span className="text-[#4CAF50] font-semibold text-sm">MPESA Integrated</span>
              </div>
            </div>

            {/* Quick Links */}
            <div>
              <h4 className="text-white font-bold mb-4">Quick Links</h4>
              <ul className="space-y-3">
                <li>
                  <a href="#products" className="text-white/60 hover:text-[#d4af37] transition-colors">Products</a>
                </li>
                <li>
                  <a href="#features" className="text-white/60 hover:text-[#d4af37] transition-colors">Features</a>
                </li>
                <li>
                  <a href="#careers" className="text-white/60 hover:text-[#d4af37] transition-colors">Careers</a>
                </li>
                <li>
                  <a href="#contact" className="text-white/60 hover:text-[#d4af37] transition-colors">Contact</a>
                </li>
                <li>
                  <button onClick={() => navigate("/faqs")} className="text-white/60 hover:text-[#d4af37] transition-colors" data-testid="footer-faqs-link">
                    FAQs
                  </button>
                </li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-white font-bold mb-4">Legal</h4>
              <ul className="space-y-3">
                <li>
                  <button onClick={() => navigate("/terms")} className="text-white/60 hover:text-[#d4af37] transition-colors" data-testid="footer-terms-link">
                    Terms & Conditions
                  </button>
                </li>
                <li>
                  <button onClick={() => navigate("/privacy")} className="text-white/60 hover:text-[#d4af37] transition-colors" data-testid="footer-privacy-link">
                    Privacy Policy
                  </button>
                </li>
                <li>
                  <button onClick={() => navigate("/login")} className="text-white/60 hover:text-[#d4af37] transition-colors" data-testid="footer-login-link">
                    Login
                  </button>
                </li>
                <li>
                  <button onClick={() => navigate("/register")} className="text-white/60 hover:text-[#d4af37] transition-colors" data-testid="footer-register-link">
                    Register
                  </button>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-white/40 text-sm">
              © {new Date().getFullYear()} Dolaglobo Finance. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <a href={`tel:${contacts?.phone || "+254700000000"}`} className="text-white/40 hover:text-[#d4af37] transition-colors flex items-center gap-2">
                <Phone className="w-4 h-4" />
                <span className="text-sm">{contacts?.phone || "+254 700 000 000"}</span>
              </a>
              <a href={`mailto:${contacts?.email || "support@dolaglobo.com"}`} className="text-white/40 hover:text-[#d4af37] transition-colors flex items-center gap-2">
                <Mail className="w-4 h-4" />
                <span className="text-sm">{contacts?.email || "support@dolaglobo.com"}</span>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;

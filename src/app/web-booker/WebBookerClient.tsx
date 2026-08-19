'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createWebBooking, fetchAllDriversForWebBooker, manualAssignDriverToWebBooking, quoteForWebBooking } from './actions';
import { MapPin, Clock, User, CreditCard, ChevronDown, CheckCircle, Calculator, FileText, Store, Radio, Car, AlertTriangle, UserPlus, Search, Circle, ToggleLeft, ToggleRight } from 'lucide-react';

function AutocompleteInput({ value, onChange, placeholder, className, isPickup }: { value: string, onChange: (v: string) => void, placeholder: string, className?: string, isPickup?: boolean }) {
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [show, setShow] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const timeoutRef = useRef<any>(null);

  useEffect(() => {
    function handleClickOutside(event: any) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShow(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);
  
  const fetchSuggestions = async (input: string) => {
    try {
      // First try the backend equivalent from user app
      const res = await fetch(`http://localhost:5000/api/places/autocomplete?input=${encodeURIComponent(input)}`);
      if (!res.ok) throw new Error("Backend unavailable");
      const data = await res.json();
      if (data && data.predictions && data.predictions.length > 0) {
        setSuggestions(data.predictions.map((p: any) => ({ id: p.place_id, description: p.description })));
        setShow(true);
      } else {
        throw new Error("Fallback required");
      }
    } catch (_err) {
      try {
        // Fallback to openstreetmap
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(input)}&format=json&limit=5&countrycodes=gb`);
        const data = await res.json();
        if (data && Array.isArray(data)) {
          setSuggestions(data.map((d: any) => ({ id: d.place_id, description: d.display_name })));
          setShow(true);
        }
      } catch (fallbackErr) {
        console.error("Autocomplete failed: ", fallbackErr);
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    onChange(input);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    if (input.length < 3) {
      setSuggestions([]);
      setShow(false);
      return;
    }

    timeoutRef.current = setTimeout(() => fetchSuggestions(input), 600);
  };

  const handleSelect = (desc: string) => {
    onChange(desc);
    setShow(false);
  };

  return (
    <div ref={wrapperRef} className="w-full relative">
      <div className="flex items-center gap-3 relative">
        {isPickup ? (
          <div className="w-3 h-3 rounded-full border-2 border-slate-400 absolute left-[-4px] top-1/2 -translate-y-1/2 z-10 bg-background dark:bg-slate-900 border-solid" style={{borderColor: '#64748b'}}></div>
        ) : (
          <div className="w-3 h-3 bg-primary absolute left-[-4px] top-1/2 -translate-y-1/2 rounded-[2px] z-10"></div>
        )}
        <input 
          type="text" required 
          placeholder={placeholder} 
          className={className}
          value={value}
          onChange={handleChange}
          onFocus={() => { if (suggestions.length > 0) setShow(true); }}
        />
      </div>
      {show && suggestions.length > 0 && (
        <ul className="absolute z-50 left-6 top-full mt-1 w-[calc(100%-1.5rem)] bg-white dark:bg-slate-800 border shadow-lg rounded-md max-h-60 overflow-auto divide-y">
          {suggestions.map((s, i) => (
            <li 
              key={i} 
              className="p-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer flex items-center gap-2"
              onClick={() => handleSelect(s.description)}
            >
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              <span className="truncate">{s.description}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function WebBookerClient() {
  const [formData, setFormData] = useState({
    pickupAddress: '',
    dropoffAddress: '',
    time: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    vehicleType: 'Saloon',
    pricingType: 'Fixed price',
    paymentMethod: 'pay',
    price: 0,
    commissionCalculation: 'Calculate automatically',
    commission: 0,
    driverCut: 0,
    flightNumber: '',
    bookingNote: ''
  });

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [bookingRef, setBookingRef] = useState("");
  const [dispatchResult, setDispatchResult] = useState<{
    mode: 'marketplace' | 'dsa_direct' | 'manual';
    assignedDriver?: {
      name: string;
      distance_miles: number;
      vehicle: string;
      plate: string;
    } | null;
  } | null>(null);

  // Live fare preview state (fetched from the service-area fare table)
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quoteLabel, setQuoteLabel] = useState<string | null>(null);
  const [quoteMiles, setQuoteMiles] = useState<number | null>(null);

  // Manual assign state
  const [manualAssign, setManualAssign] = useState(false);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<any>(null);
  const [driverSearch, setDriverSearch] = useState('');
  const [showDriverDropdown, setShowDriverDropdown] = useState(false);
  const [driversLoading, setDriversLoading] = useState(false);
  const driverDropdownRef = useRef<HTMLDivElement>(null);

  // Load drivers when manual assign is toggled on
  useEffect(() => {
    if (manualAssign && drivers.length === 0) {
      setDriversLoading(true);
      fetchAllDriversForWebBooker().then(res => {
        if (res.success) setDrivers(res.drivers);
        setDriversLoading(false);
      });
    }
  }, [manualAssign]);

  // Close driver dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: any) {
      if (driverDropdownRef.current && !driverDropdownRef.current.contains(event.target)) {
        setShowDriverDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Live fare from the service-area fare table: fetch once pickup + dropoff are
  // entered, before booking submission. The price is read-only; if pricing is
  // unavailable the submission is blocked rather than letting a ride through
  // unpriced.
  useEffect(() => {
    const pickup = (formData.pickupAddress || '').trim();
    const dropoff = (formData.dropoffAddress || '').trim();
    if (!pickup || !dropoff) {
      setQuoteLoading(false);
      setQuoteError(null);
      setQuoteLabel(null);
      setQuoteMiles(null);
      setFormData((prev) => ({ ...prev, price: 0 }));
      return;
    }

    setQuoteLoading(true);
    setQuoteError(null);
    const timer = setTimeout(async () => {
      const res = await quoteForWebBooking(pickup, dropoff, formData.vehicleType);
      if (res.success) {
        setQuoteLabel(res.quote.route_label);
        setQuoteMiles(res.quote.billed_miles);
        setQuoteError(null);
        setFormData((prev) => ({ ...prev, price: res.quote.price }));
      } else {
        setQuoteLabel(null);
        setQuoteMiles(null);
        setQuoteError(res.error);
        setFormData((prev) => ({ ...prev, price: 0 }));
      }
      setQuoteLoading(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [formData.pickupAddress, formData.dropoffAddress, formData.vehicleType]);

  const filteredDrivers = drivers.filter(d =>
    d.name.toLowerCase().includes(driverSearch.toLowerCase()) ||
    d.vehicle.toLowerCase().includes(driverSearch.toLowerCase()) ||
    d.plate.toLowerCase().includes(driverSearch.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (manualAssign && !selectedDriver) {
      alert('Please select a driver for manual assignment.');
      return;
    }

    if (quoteLoading) {
      alert('Please wait for the fare to finish calculating before saving.');
      return;
    }
    if (quoteError) {
      alert(quoteError);
      return;
    }
    if (!(formData.price > 0)) {
      alert('Pricing unavailable — contact dispatch.');
      return;
    }

    setLoading(true);
    const res = await createWebBooking(formData);
    
    if (res.success) {
      // If manual assign is on, assign the selected driver to the booking
      if (manualAssign && selectedDriver) {
        const assignRes = await manualAssignDriverToWebBooking(
          res.ride.id,
          selectedDriver.id,
          selectedDriver.name
        );
        setLoading(false);
        if (assignRes.success) {
          setBookingRef(res.ride.reference);
          setDispatchResult({
            mode: 'manual',
            assignedDriver: {
              name: selectedDriver.name,
              distance_miles: 0,
              vehicle: selectedDriver.vehicle,
              plate: selectedDriver.plate,
            },
          });
          setSuccess(true);
        } else {
          alert('Booking created but driver assignment failed: ' + assignRes.error);
        }
      } else {
        setLoading(false);
        setBookingRef(res.ride.reference);
        setDispatchResult({
          mode: res.dispatchMode as 'marketplace' | 'dsa_direct',
          assignedDriver: res.assignedDriver,
        });
        setSuccess(true);
      }
    } else {
      setLoading(false);
      alert("Error creating booking: " + res.error);
    }
  };

  const handleCloseModal = () => {
    setSuccess(false);
    setBookingRef("");
    setDispatchResult(null);
    setSelectedDriver(null);
    setManualAssign(false);
    setFormData({
      pickupAddress: '',
      dropoffAddress: '',
      time: '',
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      vehicleType: 'Saloon',
      pricingType: 'Fixed price',
      paymentMethod: 'pay',
      price: 0,
      commissionCalculation: 'Calculate automatically',
      commission: 0,
      driverCut: 0,
      flightNumber: '',
      bookingNote: ''
    });
  }

  // Compute dispatch preview text
  const getDispatchPreview = (): { label: string; isMarketplace: boolean } => {
    if (!formData.time) {
      return { label: 'ASAP — Will search for nearest driver', isMarketplace: false };
    }
    const now = new Date();
    const scheduled = new Date(formData.time);
    const diffHours = (scheduled.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (diffHours > 4) {
      return { label: `${Math.round(diffHours)}h away — Will go to Marketplace`, isMarketplace: true };
    }
    return { label: `${diffHours <= 0 ? 'Now' : Math.round(diffHours * 60) + 'min away'} — Will search for nearest driver`, isMarketplace: false };
  };

  const dispatchPreview = getDispatchPreview();

  // Derive commission values from price (avoids setState-in-effect cascading renders)
  const derivedCommission = useMemo(() => {
    if (formData.commissionCalculation === 'Calculate automatically') {
      const simulatedCommissionPercentage = 15; // Assuming 15% standard
      const comm = formData.price * (simulatedCommissionPercentage / 100);
      const cut = formData.price - comm;
      return { commission: Number(comm.toFixed(2)), driverCut: Number(cut.toFixed(2)) };
    }
    return { commission: formData.commission, driverCut: formData.driverCut };
  }, [formData.price, formData.commissionCalculation, formData.commission, formData.driverCut]);

  return (
    <div className="flex flex-col lg:flex-row gap-6 w-full h-[calc(100vh-140px)]">
      {/* Form Section */}
      <div className="flex-[2] bg-[#fdfdfd] dark:bg-card border shadow-sm rounded-xl overflow-hidden flex flex-col relative z-0" style={{ transform: 'translateZ(0)' }}>
        <div className="overflow-y-auto custom-scrollbar w-full h-full p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-8 pb-10">
          
          <div className="mb-2">
            <h2 className="text-xl font-bold">Create new job</h2>
            <p className="text-xs text-slate-500">Job will be created for UTO</p>
          </div>

          {/* Location */}
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary">
              <MapPin size={18} />
            </div>
            <div className="flex flex-col gap-6 w-full">
              <div>
                <label className="text-xs text-slate-400 font-semibold mb-4 block tracking-wider uppercase">Location</label>
                <div className="flex flex-col gap-6 relative">
                  
                  <AutocompleteInput 
                    placeholder="Pickup address"
                    className="w-full pl-6 pr-3 py-2 bg-transparent border-b border-slate-200 dark:border-slate-800 outline-none focus:border-primary transition-colors text-sm"
                    value={formData.pickupAddress}
                    onChange={(v) => setFormData({...formData, pickupAddress: v})}
                    isPickup={true}
                  />

                  <div className="w-[1.5px] h-8 bg-slate-200 dark:bg-slate-700 absolute left-[1px] top-[18px]"></div>
                  
                  <AutocompleteInput 
                    placeholder="Drop-off address"
                    className="w-full pl-6 pr-3 py-2 bg-transparent border-b border-slate-200 dark:border-slate-800 outline-none focus:border-primary transition-colors text-sm bg-slate-50 dark:bg-slate-900 rounded-sm"
                    value={formData.dropoffAddress}
                    onChange={(v) => setFormData({...formData, dropoffAddress: v})}
                    isPickup={false}
                  />

                </div>
              </div>
            </div>
          </div>

          {/* Time */}
          <div className="flex gap-4">
            <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary">
              <Clock size={18} />
            </div>
            <div className="flex flex-col gap-4 w-full">
               <label className="text-xs text-slate-400 font-semibold block tracking-wider uppercase">Time</label>
               <input 
                 type="datetime-local" required
                 className="w-full md:w-[48%] p-2 border-b border-slate-200 dark:border-slate-800 outline-none focus:border-primary bg-transparent text-sm"
                 value={formData.time}
                 onChange={e => setFormData({...formData, time: e.target.value})}
               />
               {/* Dispatch Preview Indicator */}
               {!manualAssign && (
                 <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                   dispatchPreview.isMarketplace 
                     ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900' 
                     : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900'
                 }`}>
                   {dispatchPreview.isMarketplace ? (
                     <Store className="w-3.5 h-3.5" />
                   ) : (
                     <Radio className="w-3.5 h-3.5" />
                   )}
                   <span>{dispatchPreview.label}</span>
                 </div>
               )}
            </div>
          </div>

          {/* Manual Assign Driver */}
          <div className="flex gap-4">
             <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary">
              <UserPlus size={18} />
             </div>
             <div className="flex flex-col gap-4 w-full">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-slate-400 font-semibold block tracking-wider uppercase">Driver Assignment</label>
                  <button
                    type="button"
                    onClick={() => { setManualAssign(!manualAssign); setSelectedDriver(null); }}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                      manualAssign
                        ? 'bg-primary/10 text-primary border-primary/30'
                        : 'bg-slate-50 dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {manualAssign ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                    {manualAssign ? 'Manual' : 'Auto'}
                  </button>
                </div>

                {manualAssign ? (
                  <div ref={driverDropdownRef} className="relative">
                    {selectedDriver ? (
                      <div className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-emerald-200 dark:bg-emerald-800 flex items-center justify-center">
                            <Car className="w-4 h-4 text-emerald-700 dark:text-emerald-300" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-emerald-800 dark:text-emerald-200">{selectedDriver.name}</span>
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400">{selectedDriver.vehicle} • {selectedDriver.plate}</span>
                          </div>
                        </div>
                        <button type="button" onClick={() => setSelectedDriver(null)} className="text-xs text-emerald-600 hover:text-emerald-800 underline">Change</button>
                      </div>
                    ) : (
                      <>
                        <div
                          className="flex items-center gap-2 p-2 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer hover:border-primary transition-colors"
                          onClick={() => setShowDriverDropdown(!showDriverDropdown)}
                        >
                          <Search className="w-4 h-4 text-slate-400" />
                          <input
                            type="text"
                            placeholder="Search and select a driver..."
                            className="w-full bg-transparent outline-none text-sm"
                            value={driverSearch}
                            onChange={e => { setDriverSearch(e.target.value); setShowDriverDropdown(true); }}
                            onFocus={() => setShowDriverDropdown(true)}
                          />
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        </div>

                        {showDriverDropdown && (
                          <div className="absolute z-50 mt-1 w-full bg-white dark:bg-slate-800 border shadow-xl rounded-lg overflow-hidden">
                            <div className="max-h-48 overflow-y-auto">
                              {driversLoading ? (
                                <div className="p-4 text-center text-xs text-slate-400">Loading drivers...</div>
                              ) : filteredDrivers.length === 0 ? (
                                <div className="p-4 text-center text-xs text-slate-400">No drivers found</div>
                              ) : (
                                filteredDrivers.map(d => (
                                  <button
                                    key={d.id}
                                    type="button"
                                    onClick={() => { setSelectedDriver(d); setShowDriverDropdown(false); setDriverSearch(''); }}
                                    className="w-full text-left px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-3 border-b border-slate-50 dark:border-slate-700 last:border-0 transition-colors"
                                  >
                                    <Circle className={`w-2 h-2 flex-shrink-0 ${d.is_online ? 'fill-emerald-500 text-emerald-500' : 'fill-slate-300 text-slate-300'}`} />
                                    <div className="flex flex-col min-w-0">
                                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{d.name}</span>
                                      <span className="text-[10px] text-slate-400 truncate">{d.vehicle} • {d.plate}</span>
                                    </div>
                                    {d.is_online && d.is_available && (
                                      <span className="ml-auto text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">Available</span>
                                    )}
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">System will automatically find and assign the nearest available driver.</p>
                )}
             </div>
          </div>

          {/* Passenger */}
          <div className="flex gap-4">
             <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary">
              <User size={18} />
             </div>
             <div className="flex flex-col gap-4 w-full">
                <label className="text-xs text-slate-400 font-semibold block tracking-wider uppercase">Passenger</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-8 mt-2">
                  <div className="flex flex-col gap-1 relative">
                    <label className="text-[10px] text-slate-500 absolute -top-2 left-2 bg-[#fdfdfd] dark:bg-card px-1">First name</label>
                    <input type="text" required className="p-2 border rounded-sm border-slate-200 outline-none focus:border-primary bg-transparent text-sm"
                      value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} />
                  </div>
                  <div className="flex flex-col gap-1 relative">
                    <label className="text-[10px] text-slate-500 absolute -top-2 left-2 bg-[#fdfdfd] dark:bg-card px-1">Last name</label>
                    <input type="text" required className="p-2 border border-slate-200 rounded-sm outline-none focus:border-primary bg-transparent text-sm"
                      value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} />
                  </div>
                  <div className="flex flex-col gap-1 relative">
                    <label className="text-[10px] text-slate-500 absolute -top-2 left-2 bg-[#fdfdfd] dark:bg-card px-1">Email address <span className="text-slate-400 font-normal">(optional)</span></label>
                    <input type="email" className="p-2 border border-slate-200 rounded-sm outline-none focus:border-primary bg-transparent text-sm"
                      value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                  </div>
                  <div className="flex flex-col gap-1 relative">
                    <label className="text-[10px] text-slate-500 absolute -top-2 left-2 bg-[#fdfdfd] dark:bg-card px-1 w-auto z-10">Phone number</label>
                    <input type="tel" required className="p-2 border border-slate-200 rounded-sm outline-none focus:border-primary bg-transparent text-sm relative"
                      value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                  </div>
                </div>
             </div>
          </div>

          {/* Pricing */}
          <div className="flex gap-4">
             <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary">
              <CreditCard size={18} />
             </div>
             <div className="flex flex-col gap-8 w-full border-b pb-8">
                <label className="text-xs text-slate-400 font-semibold block tracking-wider uppercase">Pricing</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-6">
                  <div className="flex flex-col gap-1 relative">
                    <label className="text-[10px] text-slate-500 absolute -top-2 left-2 bg-[#fdfdfd] dark:bg-card px-1 z-10 text-primary">Product *</label>
                    <select className="p-2 border-b-2 border-primary outline-none focus:border-primary bg-transparent text-sm appearance-none"
                      value={formData.vehicleType} onChange={e => setFormData({...formData, vehicleType: e.target.value})}>
                      <option value="Saloon">Saloon</option>
                      <option value="People Carrier">People Carrier</option>
                      <option value="Minibus">Minibus</option>
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-1 top-[10px] text-slate-400 pointer-events-none" />
                  </div>
                  <div className="flex flex-col gap-1 relative">
                    <label className="text-[10px] text-slate-500 absolute -top-2 left-2 bg-[#fdfdfd] dark:bg-card px-1 z-10 text-primary">Pricing type *</label>
                    <select className="p-2 border-b-2 border-primary outline-none bg-transparent text-sm appearance-none"
                      value={formData.pricingType} onChange={e => setFormData({...formData, pricingType: e.target.value})}>
                      <option value="On meter">On meter</option>
                      <option value="Fixed price">Fixed price</option>
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-1 top-[10px] text-slate-400 pointer-events-none" />
                  </div>
                  
                  <div className="flex flex-col gap-1 relative mt-[14px]">
                    <label className="text-[10px] text-slate-500 absolute -top-2 left-2 bg-[#fdfdfd] dark:bg-card px-1 z-10 text-primary">Payment method *</label>
                    <select className="p-2 border-b border-slate-300 outline-none bg-transparent text-sm appearance-none"
                      value={formData.paymentMethod} onChange={e => setFormData({...formData, paymentMethod: e.target.value})}>
                      <option value="pay">Pay the driver</option>
                      <option value="card">Card online</option>
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-1 top-[10px] text-slate-400 pointer-events-none" />
                  </div>
                  <div className="flex flex-col gap-1 relative mt-[14px]">
                    <label className="text-[10px] text-slate-500 absolute -top-2 left-2 bg-[#fdfdfd] dark:bg-card px-1 z-10 text-primary">Price *</label>
                    <div className="border-b-2 border-primary flex items-center px-1">
                      <span className="text-sm text-slate-600">£</span>
                      <input type="number" required readOnly aria-label="Price"
                        className="p-2 pl-2 w-full outline-none focus:border-primary bg-transparent text-sm disabled:cursor-not-allowed disabled:opacity-75"
                        value={formData.price} title="Fare is calculated automatically from the service-area fare table" />
                    </div>
                    {quoteLoading && (
                      <p className="text-[10px] text-slate-400">Calculating fare…</p>
                    )}
                    {!quoteLoading && quoteLabel && (
                      <p className="text-[10px] text-slate-500">
                        {quoteLabel}
                        {quoteMiles != null ? ` · ${quoteMiles} miles` : ''}
                      </p>
                    )}
                    {quoteError && (
                      <p className="text-[10px] text-red-500">{quoteError}</p>
                    )}
                  </div>
                </div>
             </div>
          </div>

          {/* Commission */}
          <div className="flex gap-4">
             <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary">
              <Calculator size={18} />
             </div>
             <div className="flex flex-col gap-6 w-full pb-4">
                <label className="text-xs text-slate-400 font-semibold block tracking-wider uppercase">Commission</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="flex flex-col gap-1 relative">
                    <label className="text-[10px] text-slate-500 absolute -top-4 left-0">Calculation *</label>
                    <select className="p-2 border-b border-slate-300 outline-none bg-transparent text-sm appearance-none px-0"
                      value={formData.commissionCalculation} onChange={e => setFormData({...formData, commissionCalculation: e.target.value})}>
                      <option value="Calculate automatically">Calculate automatically</option>
                      <option value="Manual">Manual</option>
                    </select>
                    <ChevronDown className="w-4 h-4 absolute right-1 top-[10px] text-slate-400 pointer-events-none" />
                  </div>
                  <div className="flex flex-col gap-1 relative">
                    <label className="text-[10px] text-slate-500 absolute -top-4 left-0">Commission</label>
                    <div className="border-b border-slate-300 flex items-center px-0">
                      <span className="text-sm text-slate-600 mr-2">£</span>
                      <input type="number" disabled={formData.commissionCalculation === 'Calculate automatically'} className="p-2 pl-0 w-full outline-none bg-transparent text-sm"
                        value={derivedCommission.commission} onChange={e => setFormData({...formData, commission: Number(e.target.value)})} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 relative">
                    <label className="text-[10px] text-slate-500 absolute -top-4 left-0">Driver cut</label>
                    <div className="border-b border-slate-300 flex items-center px-0">
                      <span className="text-sm text-slate-600 mr-2">£</span>
                      <input type="number" disabled={formData.commissionCalculation === 'Calculate automatically'} className="p-2 pl-0 w-full outline-none bg-transparent text-sm min-w-0"
                        value={derivedCommission.driverCut} onChange={e => setFormData({...formData, driverCut: Number(e.target.value)})} />
                    </div>
                  </div>
                </div>
             </div>
          </div>

          {/* Extra */}
          <div className="flex gap-4">
             <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary">
              <FileText size={18} />
             </div>
             <div className="flex flex-col gap-8 w-full border-t pt-8 border-slate-200">
                <label className="text-xs text-slate-400 font-semibold block tracking-wider uppercase">Extra</label>
                
                <div className="flex flex-col gap-1 relative">
                  <label className="text-[10px] text-slate-500 absolute -top-4 left-0">Flight number</label>
                  <input type="text" className="p-2 border-b border-slate-300 outline-none bg-transparent text-sm px-0"
                    value={formData.flightNumber} onChange={e => setFormData({...formData, flightNumber: e.target.value})} />
                </div>
                
                <div className="flex flex-col gap-1 relative mt-[14px]">
                  <label className="text-[10px] text-slate-500 absolute -top-4 left-0 text-[#0ea5e9]">Booking Note</label>
                  <textarea rows={1} className="p-2 border-b-2 border-[#0ea5e9] outline-none bg-transparent text-sm px-0 resize-none"
                    value={formData.bookingNote} onChange={e => setFormData({...formData, bookingNote: e.target.value})} />
                </div>

             </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={loading || quoteLoading || !!quoteError}
              className="bg-[#0ea5e9] text-white px-8 py-2 rounded font-medium hover:bg-[#0284c7] transition-colors disabled:opacity-50 text-sm shadow-md"
            >
              {loading ? "Dispatching..." : quoteError ? "Pricing unavailable" : quoteLoading ? "Calculating…" : "Save"}
            </button>
          </div>
        </form>
        </div>
      </div>

      {/* Map Section */}
      <div className="hidden lg:flex flex-[1.2] bg-card border shadow-sm rounded-xl overflow-hidden h-full flex-col relative z-0" style={{ transform: 'translateZ(0)' }}>
        <iframe 
          title="Booking Map"
          width="100%" 
          height="100%" 
          frameBorder="0" 
          scrolling="no" 
          className="rounded-xl"
          src={formData.pickupAddress && formData.dropoffAddress 
            ? `https://maps.google.com/maps?q=${encodeURIComponent(formData.pickupAddress)}%20to%20${encodeURIComponent(formData.dropoffAddress)}&t=&z=12&ie=UTF8&iwloc=&output=embed`
            : "https://www.openstreetmap.org/export/embed.html?bbox=-1.8,51.8,-1.7,51.9&layer=mapnik&marker=51.85,-1.75" // Mocking around Bourton on the Water
          }
          style={{ border: 0, minHeight: '100%', borderRadius: '0.75rem' }}
        ></iframe>
      </div>

      {/* Success Modal */}
      {success && (
        <div className="fixed justify-center z-[100] left-0 right-0 top-0 bottom-0 bg-black/40 flex items-center">
          <div className="bg-white border p-6 shadow-2xl rounded-[12px] flex flex-col items-center gap-4 max-w-sm w-full animate-in fade-in zoom-in duration-200" style={{boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)'}}>
            
            {/* Dispatch Mode Header */}
            {dispatchResult?.mode === 'manual' ? (
              <>
                <div className="w-14 h-14 rounded-full bg-indigo-100 flex items-center justify-center">
                  <UserPlus className="w-7 h-7 text-indigo-600" />
                </div>
                <h3 className="text-[15px] font-bold tracking-tight text-slate-800 text-center">
                  Driver Manually Assigned
                </h3>
                {dispatchResult.assignedDriver && (
                  <div className="bg-indigo-50 border border-indigo-200 w-full p-3 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-200 flex items-center justify-center flex-shrink-0">
                        <User className="w-5 h-5 text-indigo-700" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-indigo-800">{dispatchResult.assignedDriver.name}</span>
                        <span className="text-[11px] text-indigo-600">{dispatchResult.assignedDriver.vehicle} • {dispatchResult.assignedDriver.plate}</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : dispatchResult?.mode === 'marketplace' ? (
              <>
                <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center">
                  <Store className="w-7 h-7 text-amber-600" />
                </div>
                <h3 className="text-[15px] font-bold tracking-tight text-slate-800 text-center">
                  Sent to Marketplace
                </h3>
                <p className="text-slate-500 text-[12px] text-center leading-relaxed">
                  This booking is more than 4 hours away. It has been placed in the <strong>marketplace</strong> so available drivers can accept it.
                </p>
              </>
            ) : dispatchResult?.assignedDriver ? (
              <>
                <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Car className="w-7 h-7 text-emerald-600" />
                </div>
                <h3 className="text-[15px] font-bold tracking-tight text-slate-800 text-center">
                  Driver Assigned!
                </h3>
                <div className="bg-emerald-50 border border-emerald-200 w-full p-3 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-200 flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-emerald-700" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-emerald-800">{dispatchResult.assignedDriver.name}</span>
                      <span className="text-[11px] text-emerald-600">{dispatchResult.assignedDriver.vehicle} • {dispatchResult.assignedDriver.plate}</span>
                      <span className="text-[10px] text-emerald-500 font-semibold">{dispatchResult.assignedDriver.distance_miles} miles away</span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center">
                  <AlertTriangle className="w-7 h-7 text-amber-600" />
                </div>
                <h3 className="text-[15px] font-bold tracking-tight text-slate-800 text-center">
                  No Nearby Drivers
                </h3>
                <p className="text-slate-500 text-[12px] text-center leading-relaxed">
                  No available drivers were found near the pickup location. The booking has been moved to the <strong>marketplace</strong> for drivers to accept.
                </p>
              </>
            )}

            <div className="bg-slate-50 border w-full p-4 rounded-md text-center">
              <span className="text-slate-500 text-[11px] uppercase font-bold tracking-wider mb-1 block">Reference Number</span>
              <span className="text-xl font-black text-slate-800 tracking-widest">{bookingRef}</span>
            </div>
            <button 
              onClick={handleCloseModal}
              className="px-6 py-[6px] bg-[#0ea5e9] text-white self-end text-sm font-semibold rounded hover:bg-[#0284c7] transition-colors"
            >
              OK
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

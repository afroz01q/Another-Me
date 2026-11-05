import React, { useState, useRef, useEffect } from 'react'
import {
  Upload, Camera, RefreshCw, X, Check, Shield, AlertTriangle,
  Sparkles, Key, ExternalLink, Play, CheckCircle2, ChevronRight
} from 'lucide-react'
import { Modal, Button, Input } from '@/components/ui'
import { useTwinStore, useAuthStore } from '@/store'
import type { AvatarProvider } from '@/types'
import toast from 'react-hot-toast'
import { avatarService } from '@/lib/avatarService'

interface PersonalTwinUploadModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function PersonalTwinUploadModal({ isOpen, onClose, onSuccess }: PersonalTwinUploadModalProps) {
  const { user } = useAuthStore()
  const {
    avatar,
    isUploadingPhoto,
    isGeneratingAvatar,
    avatarError,
    uploadPersonalPhoto,
    generateAvatarVideo,
    pollAvatarStatus,
  } = useTwinStore()

  const fileInputRef = useRef<HTMLInputElement>(null)

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [twinName, setTwinName] = useState(avatar?.name || `${user?.name?.split(' ')[0] || 'My'} Twin`)
  const [consentGiven, setConsentGiven] = useState(false)
  const [provider, setProvider] = useState<AvatarProvider>('d-id')
  const [apiKey, setApiKey] = useState('')
  const [isApiKeyConfigured, setIsApiKeyConfigured] = useState(false)
  const [activeStep, setActiveStep] = useState<'upload' | 'configure' | 'generating'>('upload')
  const [pollingActive, setPollingActive] = useState(false)
  const [isTestingKey, setIsTestingKey] = useState(false)

  // Load server provider configuration on open
  useEffect(() => {
    if (isOpen) {
      avatarService.getProviderConfig().then((cfg) => {
        if (cfg.active_provider) setProvider(cfg.active_provider)
        setIsApiKeyConfigured(!!cfg.d_id_configured)
      }).catch(() => {})

      // If user already has a photo uploaded, show preview
      if (avatar?.source_image_path) {
        setPreviewUrl(avatar.source_image_path)
        setConsentGiven(avatar.consent_given || false)
      }
    }
  }, [isOpen, avatar])

  // Handle polling when in generating state
  useEffect(() => {
    let interval: any = null
    if (pollingActive && avatar?.provider_job_id && (avatar.status === 'processing' || avatar.status === 'queued')) {
      interval = setInterval(async () => {
        const updated = await pollAvatarStatus()
        if (updated?.status === 'completed') {
          setPollingActive(false)
          toast.success('Your personal AI twin video is ready!', { icon: '🎉' })
          if (onSuccess) onSuccess()
          onClose()
        } else if (updated?.status === 'failed') {
          setPollingActive(false)
          toast.error(updated.error_message || 'Video generation failed at provider')
        }
      }, 3000)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [pollingActive, avatar?.status, avatar?.provider_job_id])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type.toLowerCase())) {
      toast.error('Invalid file type. Please upload a clear JPG, PNG, or WebP photo.')
      return
    }

    // Validate size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size exceeds 10 MB limit.')
      return
    }

    setSelectedFile(file)
    const localUrl = URL.createObjectURL(file)
    setPreviewUrl(localUrl)
  }

  const handleRemovePhoto = () => {
    setSelectedFile(null)
    setPreviewUrl(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleUploadAndProceed = async () => {
    if (!previewUrl && !selectedFile) {
      toast.error('Please select a photo of your face first')
      return
    }

    if (!consentGiven) {
      toast.error('Explicit consent is required to generate an AI likeness')
      return
    }

    try {
      if (selectedFile) {
        toast.loading('Uploading and validating photo...', { id: 'upload-toast' })
        await uploadPersonalPhoto(selectedFile, consentGiven, twinName)
        toast.success('Photo validated and securely saved!', { id: 'upload-toast' })
      }
      setActiveStep('configure')
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload photo', { id: 'upload-toast' })
    }
  }

  const handleStartGeneration = async () => {
    try {
      toast.loading('Dispatching job to AI video provider...', { id: 'gen-toast' })
      const res = await generateAvatarVideo({
        provider,
        apiKey: apiKey.trim() || undefined,
        scriptText: `Hello! I am ${twinName}. I am your personal digital twin, created from your photograph to represent you naturally.`,
      })

      toast.success('AI animation job queued! Generating your talking-head avatar...', { id: 'gen-toast' })
      setActiveStep('generating')
      setPollingActive(true)
    } catch (err: any) {
      toast.dismiss('gen-toast')
      if (err.code === 'PROVIDER_CREDENTIALS_REQUIRED') {
        toast.error('API credentials required. Please enter your provider API key below.', { duration: 5000 })
      } else {
        toast.error(err.message || 'Generation request failed')
      }
    }
  }

  const handleSaveProviderKey = async () => {
    if (!apiKey.trim()) {
      toast.error('Please enter an API key')
      return
    }

    setIsTestingKey(true)
    try {
      await avatarService.saveProviderConfig({
        d_id_api_key: provider === 'd-id' ? apiKey.trim() : undefined,
        replicate_api_token: provider === 'replicate' ? apiKey.trim() : undefined,
        active_provider: provider,
      })
      setIsApiKeyConfigured(true)
      toast.success('API key saved securely on server!')
    } catch (e: any) {
      toast.error('Failed to save API key')
    } finally {
      setIsTestingKey(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Your Personal AI Digital Twin"
      maxWidth="lg"
    >
      <div className="space-y-6">
        {/* Step Indicator */}
        <div className="flex items-center justify-between border-b border-[#35332d] pb-3 text-xs">
          <div className={`flex items-center gap-1.5 ${activeStep === 'upload' ? 'text-[#da7756] font-semibold' : 'text-[#7d7a73]'}`}>
            <span className="w-5 h-5 rounded-full flex items-center justify-center border text-[10px] font-mono">1</span>
            <span>Upload Photo</span>
          </div>
          <ChevronRight size={14} className="text-[#35332d]" />
          <div className={`flex items-center gap-1.5 ${activeStep === 'configure' ? 'text-[#da7756] font-semibold' : 'text-[#7d7a73]'}`}>
            <span className="w-5 h-5 rounded-full flex items-center justify-center border text-[10px] font-mono">2</span>
            <span>Provider & Likeness</span>
          </div>
          <ChevronRight size={14} className="text-[#35332d]" />
          <div className={`flex items-center gap-1.5 ${activeStep === 'generating' ? 'text-[#da7756] font-semibold' : 'text-[#7d7a73]'}`}>
            <span className="w-5 h-5 rounded-full flex items-center justify-center border text-[10px] font-mono">3</span>
            <span>Video Synthesis</span>
          </div>
        </div>

        {/* ======================================================== */}
        {/* STEP 1: UPLOAD PHOTO                                     */}
        {/* ======================================================== */}
        {activeStep === 'upload' && (
          <div className="space-y-5 animate-fade-in">
            <div className="text-xs text-[#b5b1a8] font-serif italic">
              Upload a clear, front-facing photograph of your face with good lighting. This image forms the visual identity of your personal digital twin.
            </div>

            {/* Photo Preview / Dropzone */}
            <div className="flex flex-col items-center justify-center">
              {previewUrl ? (
                <div className="relative group w-48 h-48 sm:w-56 sm:h-56 rounded-2xl overflow-hidden border-2 border-[#da7756]/50 shadow-xl bg-[#201f1c]">
                  <img
                    src={previewUrl}
                    alt="Personal face preview"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-3">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-full bg-[#da7756] text-[#181816] text-xs font-semibold hover:bg-[#e28a6c] transition-colors"
                    >
                      Replace Photo
                    </button>
                    <button
                      onClick={handleRemovePhoto}
                      className="px-3 py-1 rounded-full bg-red-600/80 text-white text-xs hover:bg-red-500 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full max-w-sm h-52 border-2 border-dashed border-[#35332d] hover:border-[#da7756]/60 rounded-2xl bg-[#201f1c] hover:bg-[#282622] transition-all cursor-pointer flex flex-col items-center justify-center p-6 text-center group"
                >
                  <div className="w-14 h-14 rounded-2xl bg-[#da7756]/15 text-[#da7756] flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                    <Camera size={26} />
                  </div>
                  <span className="font-serif text-sm font-normal text-[#edebe8] block mb-1">
                    Select a photograph of your face
                  </span>
                  <span className="text-xs text-[#7d7a73] font-sans">
                    Supports PNG, JPG, or WebP (max 10 MB)
                  </span>
                  <span className="mt-3 px-3 py-1 rounded-full text-[11px] font-mono bg-[#282622] text-[#da7756] border border-[#35332d]">
                    Browse Files
                  </span>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleFileSelect}
              />
            </div>

            {/* Twin Name Field */}
            <div>
              <label className="text-xs font-semibold text-[#edebe8] block mb-1">Twin Display Name</label>
              <Input
                value={twinName}
                onChange={(e) => setTwinName(e.target.value)}
                placeholder="e.g. Irfan AI"
              />
            </div>

            {/* Legal Consent Checkbox */}
            <div className="p-3.5 rounded-xl bg-[#282622] border border-[#35332d]">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={consentGiven}
                  onChange={(e) => setConsentGiven(e.target.checked)}
                  className="mt-0.5 accent-[#da7756] w-4 h-4 rounded cursor-pointer"
                />
                <div className="text-xs text-[#b5b1a8]">
                  <span className="font-semibold text-[#edebe8] block mb-0.5">
                    User Consent for Likeness Processing
                  </span>
                  I confirm that I am the individual in this photograph and I grant explicit permission to Another Me to process this image to generate an animated AI digital twin likeness for my private account.
                </div>
              </label>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-[#35332d]">
              <Button variant="ghost" size="sm" onClick={onClose} className="rounded-full">
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={(!previewUrl && !selectedFile) || !consentGiven || isUploadingPhoto}
                onClick={handleUploadAndProceed}
                className="bg-[#da7756] hover:bg-[#e28a6c] text-[#181816] font-semibold rounded-full flex items-center gap-1.5"
              >
                {isUploadingPhoto ? 'Uploading...' : 'Save & Configure Provider →'}
              </Button>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* STEP 2: PROVIDER & API KEY CONFIGURATION                 */}
        {/* ======================================================== */}
        {activeStep === 'configure' && (
          <div className="space-y-5 animate-fade-in">
            <div className="text-xs text-[#b5b1a8] font-serif italic">
              Another Me connects directly to state-of-the-art AI video avatar synthesis providers to animate your face with natural lip sync, eye movements, and expressions.
            </div>

            {/* Provider Selection Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                onClick={() => setProvider('d-id')}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  provider === 'd-id'
                    ? 'bg-[#201f1c] border-[#da7756] shadow-md shadow-[#da7756]/10'
                    : 'bg-[#282622] border-[#35332d] hover:border-[#da7756]/40'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-serif font-normal text-sm text-[#edebe8]">D-ID Studio</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#da7756]/15 text-[#da7756] font-bold">
                    RECOMMENDED
                  </span>
                </div>
                <p className="text-xs text-[#b5b1a8]">
                  Photorealistic talking-head video with expressive facial animation and real-time lip sync.
                </p>
              </div>

              <div
                onClick={() => setProvider('replicate')}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  provider === 'replicate'
                    ? 'bg-[#201f1c] border-[#da7756] shadow-md shadow-[#da7756]/10'
                    : 'bg-[#282622] border-[#35332d] hover:border-[#da7756]/40'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-serif font-normal text-sm text-[#edebe8]">Replicate</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#201f1c] text-[#7d7a73] border border-[#35332d]">
                    SadTalker
                  </span>
                </div>
                <p className="text-xs text-[#b5b1a8]">
                  Open-source SadTalker / LivePortrait neural talking-head models hosted on Replicate.
                </p>
              </div>
            </div>

            {/* API Key Configuration */}
            <div className="p-4 rounded-xl bg-[#201f1c] border border-[#35332d] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Key size={14} className="text-[#da7756]" />
                  <span className="text-xs font-semibold text-[#edebe8]">
                    {provider === 'd-id' ? 'D-ID API Key' : 'Replicate API Token'}
                  </span>
                </div>
                {isApiKeyConfigured && (
                  <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    <CheckCircle2 size={11} /> Configured on Server
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Input
                  type="password"
                  placeholder={
                    provider === 'd-id'
                      ? 'Paste D-ID API Key (e.g. bXlfdXNlcjpwYXNzd29yZA...)'
                      : 'r8_... (Replicate API Token)'
                  }
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="flex-1 font-mono text-xs"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleSaveProviderKey}
                  disabled={!apiKey.trim() || isTestingKey}
                  className="rounded-full shrink-0"
                >
                  Save Key
                </Button>
              </div>

              <div className="flex items-center justify-between text-[11px] text-[#7d7a73]">
                <span>
                  {provider === 'd-id'
                    ? 'Get a free key from D-ID Creative Reality Studio'
                    : 'Get your token from Replicate account settings'}
                </span>
                <a
                  href={provider === 'd-id' ? 'https://studio.d-id.com/account-settings' : 'https://replicate.com/account/api-tokens'}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#da7756] hover:underline flex items-center gap-1 font-mono"
                >
                  Get API Key <ExternalLink size={10} />
                </a>
              </div>
            </div>

            {/* Status / Error Banner */}
            {avatarError && (
              <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 text-xs text-red-200 flex items-start gap-2">
                <AlertTriangle size={15} className="text-red-400 shrink-0 mt-0.5" />
                <span>{avatarError}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-between items-center pt-2 border-t border-[#35332d]">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveStep('upload')}
                className="rounded-full"
              >
                ← Back to Photo
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={isGeneratingAvatar}
                onClick={handleStartGeneration}
                className="bg-[#da7756] hover:bg-[#e28a6c] text-[#181816] font-semibold rounded-full flex items-center gap-1.5 shadow-lg shadow-[#da7756]/20"
              >
                <Sparkles size={14} />
                Generate Animated Twin Video
              </Button>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* STEP 3: REAL-TIME GENERATION PROGRESS                    */}
        {/* ======================================================== */}
        {activeStep === 'generating' && (
          <div className="space-y-6 text-center py-4 animate-fade-in">
            <div className="relative w-36 h-36 mx-auto rounded-2xl overflow-hidden border-2 border-[#da7756] shadow-2xl">
              {Boolean(previewUrl) && (
                <img
                  src={previewUrl!}
                  alt="Avatar source"
                  className="w-full h-full object-cover filter brightness-95"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end justify-center pb-2">
                <div className="flex items-center gap-1.5 bg-[#da7756] text-[#181816] text-[10px] font-mono font-bold px-2 py-0.5 rounded-full uppercase">
                  <RefreshCw size={10} className="animate-spin" /> Synthesizing
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-serif text-lg font-normal text-[#edebe8]">
                Generating Your Talking Digital Twin
              </h3>
              <p className="text-xs text-[#b5b1a8] mt-1 max-w-sm mx-auto font-serif italic">
                Our AI video engine is animating facial expressions, eyes, and lip synchronization to match speech. This usually takes 15–40 seconds.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-[#201f1c] border border-[#35332d] max-w-sm mx-auto text-left text-xs space-y-1.5 font-mono">
              <div className="flex justify-between text-[#7d7a73]">
                <span>Provider:</span>
                <span className="text-[#edebe8] uppercase">{avatar?.provider || provider}</span>
              </div>
              <div className="flex justify-between text-[#7d7a73]">
                <span>Job ID:</span>
                <span className="text-[#da7756]">{avatar?.provider_job_id || 'Queued...'}</span>
              </div>
              <div className="flex justify-between text-[#7d7a73]">
                <span>Status:</span>
                <span className="text-emerald-400 capitalize">{avatar?.status || 'Processing'}</span>
              </div>
            </div>

            <div className="pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onClose()
                  toast('Generation will continue in the background.', { icon: '⏳' })
                }}
                className="rounded-full text-xs text-[#b5b1a8]"
              >
                View Status in "Your Twin" Section
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
